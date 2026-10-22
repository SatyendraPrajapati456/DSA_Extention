/**
 * AlgoSync Common Content Script Helper
 * Provides unified HUD badge, code extraction helpers, and background messaging.
 */

window.AlgoSyncCommon = {
  /**
   * Initializes a non-intrusive floating HUD widget on problem pages
   */
  initHUD(platformName) {
    if (document.getElementById('algosync-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'algosync-hud';
    hud.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 9999px;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(99, 102, 241, 0.2);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      user-select: none;
    `;

    hud.innerHTML = `
      <span id="algosync-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
      <span id="algosync-text">AlgoSync: Auto-sync Ready</span>
    `;

    hud.title = 'AlgoSync AI is actively monitoring for accepted submissions.';

    hud.addEventListener('click', () => {
      // Open popup or options
      chrome.runtime.sendMessage({ type: 'GET_STATUS_SUMMARY' }, (res) => {
        if (res && res.summary) {
          alert(`AlgoSync AI Active\n\nPlatform: ${platformName}\nGitHub Repo: ${res.summary.repoName}\nAI Provider: ${res.summary.provider}\nTotal Synced: ${res.summary.successful}/${res.summary.total}`);
        }
      });
    });

    document.body.appendChild(hud);
  },

  /**
   * Updates HUD status
   * @param {'ready'|'syncing'|'success'|'error'} state 
   * @param {string} message 
   */
  updateHUD(state, message) {
    const hud = document.getElementById('algosync-hud');
    const dot = document.getElementById('algosync-dot');
    const text = document.getElementById('algosync-text');
    if (!hud || !dot || !text) return;

    if (state === 'syncing') {
      dot.style.background = '#F59E0B';
      text.innerText = message || 'AlgoSync: Generating & Syncing...';
      hud.style.borderColor = 'rgba(245, 158, 11, 0.5)';
    } else if (state === 'success') {
      dot.style.background = '#10B981';
      text.innerText = message || 'AlgoSync: Synced to GitHub! ✓';
      hud.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      setTimeout(() => {
        this.updateHUD('ready', 'AlgoSync: Auto-sync Ready');
      }, 5000);
    } else if (state === 'error') {
      dot.style.background = '#EF4444';
      text.innerText = message || 'AlgoSync: Sync Failed';
      hud.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      setTimeout(() => {
        this.updateHUD('ready', 'AlgoSync: Auto-sync Ready');
      }, 6000);
    } else {
      dot.style.background = '#10B981';
      text.innerText = message || 'AlgoSync: Auto-sync Ready';
      hud.style.borderColor = 'rgba(99, 102, 241, 0.35)';
    }
  },

  /**
   * Sends accepted submission payload to service worker
   */
  notifyAcceptedSubmission(submission) {
    console.log('[AlgoSync] Notifying background of accepted submission:', submission.title);
    this.updateHUD('syncing', 'AlgoSync: Generating AI Solution & Syncing...');

    chrome.runtime.sendMessage({
      type: 'SUBMISSION_ACCEPTED',
      payload: submission
    }, (response) => {
      if (response && response.success) {
        this.updateHUD('success', 'AlgoSync: Synced to GitHub! 🚀');
      } else {
        const errMsg = response?.error || 'Sync failed';
        console.error('[AlgoSync] Background sync error:', errMsg);
        this.updateHUD('error', `AlgoSync: ${errMsg.substring(0, 30)}...`);
      }
    });
  },

  /**
   * Safely extracts text from an element matching selectors
   */
  getText(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        return el.innerText.trim();
      }
    }
    return '';
  },

  /**
   * Cleans HTML markup into readable plain text for problem descriptions.
   * Strips all stylesheets, non-content tags, converts MathJax TeX formulas,
   * formats lists and paragraphs, and preserves mathematical symbols.
   */
  cleanHtmlToText(html) {
    if (!html) return '';

    // 1. Strip <style> blocks completely (e.g. HackerRank MathJax_SVG_styles CSS)
    let cleaned = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // 2. Preserve MathJax scripts to escaped text before stripping scripts
    cleaned = cleaned.replace(/<script\b[^>]*type=["']math\/(?:tex|mml)["'][^>]*>([\s\S]*?)<\/script>/gi, (match, p1) => {
      return ' ' + p1.replace(/</g, '&lt;').replace(/>/g, '&gt;') + ' ';
    });

    // 3. Remove non-content tags: other scripts, svg paths, iframes, noscripts
    cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
    cleaned = cleaned.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
    cleaned = cleaned.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // 4. Formatting replacements
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
    cleaned = cleaned.replace(/<\/(p|div|h[1-6]|tr|hr)>/gi, '\n\n');
    cleaned = cleaned.replace(/<li\b[^>]*>/gi, '\n• ');
    
    // 5. Strip all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // 6. Decode common HTML entities (only AFTER stripping tags!)
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&le;/g, '≤')
      .replace(/&ge;/g, '≥');

    // 7. Normalize line breaks and spaces
    return cleaned
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  /**
   * Extracts code from Monaco editor elements with strict vertical line order sorting
   * to prevent line scrambling caused by recycled virtual DOM nodes.
   */
  extractCodeFromMonaco(root = document) {
    const lines = root.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (!lines || lines.length === 0) return '';
    const sorted = Array.from(lines).sort((a, b) => {
      const getTop = (el) => {
        const style = el.style.top;
        if (style) return parseFloat(style) || 0;
        const match = el.getAttribute('style')?.match(/top:\s*([\d.]+)px/);
        if (match) return parseFloat(match[1]) || 0;
        return el.getBoundingClientRect().top;
      };
      return getTop(a) - getTop(b);
    });
    return sorted.map(l => l.textContent || '').join('\n').trim();
  },

  /**
   * Intelligently detects programming language by analyzing syntax and keywords in code
   * @param {string} code 
   * @returns {string|null} Detected language e.g. 'Java', 'Python', 'C++', 'C', 'JavaScript', etc.
   */
  detectLanguageFromCode(code) {
    if (!code || typeof code !== 'string') return null;
    const text = code.trim();
    if (!text || text.length < 5) return null;

    let javaScore = 0;
    let pythonScore = 0;
    let cppScore = 0;
    let cScore = 0;
    let jsScore = 0;
    let rustScore = 0;
    let goScore = 0;

    // Java syntax indicators
    if (/import\s+java\./.test(text)) javaScore += 15;
    if (/public\s+class\s+\w+/.test(text)) javaScore += 10;
    if (/public\s+static\s+void\s+main/.test(text)) javaScore += 12;
    if (/System\.out\.(println|print)/.test(text)) javaScore += 10;
    if (/\b(Scanner|BufferedReader|BufferedWriter)\b/.test(text)) javaScore += 8;
    if (/\b(List|ArrayList|Map|HashMap|Set|HashSet)<[A-Z]/.test(text)) javaScore += 8;
    if (/throws\s+(IO)?Exception/.test(text)) javaScore += 8;
    if (/@Override/.test(text)) javaScore += 6;
    if (/\bpublic\s+(static\s+)?(int|long|void|boolean|String|double|float)\s+\w+\s*\(/.test(text)) javaScore += 8;
    if (/class\s+Result\b/.test(text) && /\b(long|int|List<|String)\b/.test(text)) javaScore += 8;
    if (/\b(long|int|boolean|double)\s+\w+\s*=\s*[^;]+;/.test(text)) javaScore += 4;

    // Python syntax indicators
    if (/def\s+\w+\s*\([^)]*\)\s*:/.test(text)) pythonScore += 12;
    if (/if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(text)) pythonScore += 12;
    if (/from\s+\w+\s+import/.test(text)) pythonScore += 8;
    if (/\bimport\s+(sys|math|os|collections|heapq|itertools)\b/.test(text)) pythonScore += 8;
    if (/\belif\s+/.test(text)) pythonScore += 8;
    if (/\bself\.\w+/.test(text)) pythonScore += 8;
    if (/print\s*\([^)]*\)\s*$/m.test(text) && !/;/.test(text)) pythonScore += 5;
    if (/class\s+\w+(\([^)]*\))?\s*:/.test(text)) pythonScore += 6;

    // C++ syntax indicators
    if (/#include\s*<[a-z_./]+>/.test(text)) cppScore += 8;
    if (/using\s+namespace\s+std;/.test(text)) cppScore += 12;
    if (/std::(vector|cout|cin|string|map|unordered_map)/.test(text)) cppScore += 10;
    if (/\b(cout\s*<<|cin\s*>>)/.test(text)) cppScore += 10;
    if (/\bvector<[a-z0-9_]+>/i.test(text)) cppScore += 8;

    // C syntax indicators
    if (/#include\s*<stdio\.h>/.test(text)) cScore += 10;
    if (/\bprintf\s*\(/.test(text) && cppScore === 0 && javaScore === 0) cScore += 6;

    // JavaScript / TypeScript syntax indicators
    if (/\bfunction\s+\w+\s*\(/.test(text)) jsScore += 6;
    if (/\bconsole\.log\s*\(/.test(text)) jsScore += 10;
    if (/\b(const|let|var)\s+\w+\s*=/.test(text)) jsScore += 5;

    // Rust syntax indicators
    if (/\bfn\s+(main|\w+)\s*\(/.test(text)) rustScore += 10;
    if (/println!\s*\(/.test(text)) rustScore += 10;
    if (/use\s+std::/.test(text)) rustScore += 8;

    // Go syntax indicators
    if (/package\s+main/.test(text)) goScore += 12;
    if (/func\s+(main|\w+)\s*\(/.test(text)) goScore += 10;
    if (/fmt\.(Println|Print|Scan)/.test(text)) goScore += 10;

    const candidates = [
      { lang: 'Java', score: javaScore },
      { lang: 'Python', score: pythonScore },
      { lang: 'C++', score: cppScore },
      { lang: 'C', score: cScore },
      { lang: 'JavaScript', score: jsScore },
      { lang: 'Rust', score: rustScore },
      { lang: 'Go', score: goScore }
    ];

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0].score >= 6) {
      return candidates[0].lang;
    }
    return null;
  }
};

