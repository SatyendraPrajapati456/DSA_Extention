/**
 * HackerRank Content Script
 * Monitors submissions on HackerRank challenges, detects verified "Congratulations" /
 * "Accepted" verdicts across classic and modern UI variants, extracts challenge metadata,
 * original code (Monaco, Ace, CodeMirror), and initiates the AlgoSync sync pipeline.
 */

(function () {
  console.log('[AlgoSync] HackerRank content script initialized.');
  window.AlgoSyncCommon.initHUD('HackerRank');

  let lastProcessedTime = 0;
  let lastProcessedSlug = '';
  let pollingInterval = null;
  let pollingAttempts = 0;

  // Initial setup
  attachSubmitButtonListeners();
  checkHackerRankVerdict();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes
  const observer = new MutationObserver(() => {
    checkHackerRankVerdict();
    attachSubmitButtonListeners();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for keyboard submit hotkeys (Cmd/Ctrl + Enter)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] HackerRank submit hotkey detected, initiating active polling...');
      startPollingForVerdict();
    }
  });

  /**
   * Attaches click listeners to HackerRank's "Submit Code" buttons to trigger
   * high-frequency active polling during code evaluation.
   */
  function attachSubmitButtonListeners() {
    const buttons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;

      const text = (btn.innerText || btn.textContent || '').trim();
      const analytics = btn.getAttribute('data-analytics') || '';
      const isSubmitBtn =
        text === 'Submit Code' ||
        text === 'Submit' ||
        analytics === 'SubmitCode' ||
        btn.classList.contains('hr-monaco-submit') ||
        btn.classList.contains('pull-right-btn');

      if (isSubmitBtn) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] HackerRank Submit button clicked, initiating active polling...');
          startPollingForVerdict();
        });
      }
    }
  }

  /**
   * Starts high-frequency polling every 500ms for up to 40 seconds
   * to catch fast or async verdict renders.
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkHackerRankVerdict();
      if (found || pollingAttempts >= 80) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 500);
  }

  /**
   * Evaluates the DOM for multiple HackerRank success / accepted indicators.
   * Returns true if an accepted submission was detected and processed.
   */
  function checkHackerRankVerdict() {
    // Strategy 1: Check explicit success headers, banners, and modals
    const candidateSelectors = [
      '.congratulations-heading',
      '.congrats-heading',
      '[data-analytics="SubmissionSuccess"]',
      'div[class*="success-title"]',
      'div[class*="congratulations"]',
      'div[class*="congrats"]',
      'div[class*="submission-success"]',
      'div[class*="status-success"]',
      '.submission-result-header',
      'h1', 'h2', 'h3', 'h4', 'p', 'span', 'div[role="alert"]'
    ];

    const elements = document.querySelectorAll(candidateSelectors.join(', '));

    for (const el of elements) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length > 250) continue;

      // Regex to detect HackerRank success phrases
      const isMatch =
        /congratulations/i.test(text) ||
        /you (?:have )?passed all (?:the )?test cases/i.test(text) ||
        /you solved this challenge/i.test(text) ||
        /you have solved this challenge/i.test(text) ||
        /all test cases passed/i.test(text) ||
        /^accepted$/i.test(text);

      if (isMatch) {
        // Guard against negative phrases like "didn't pass all test cases" or "failed"
        if (!/not|didn't|failed|wrong/i.test(text)) {
          handleAccepted();
          return true;
        }
      }
    }

    // Strategy 2: Test case status aggregation (for classic and contest UIs)
    const testcaseStatusEls = document.querySelectorAll(
      '.testcase-status, [data-analytics*="TestCase"], .test-case-item, div[class*="test-case-status"]'
    );

    if (testcaseStatusEls.length > 0) {
      let passedCount = 0;
      let hasFailure = false;

      for (const tc of testcaseStatusEls) {
        const tcText = (tc.innerText || tc.textContent || '').toLowerCase().trim();
        if (!tcText) continue;

        if (
          tcText.includes('wrong') ||
          tcText.includes('fail') ||
          tcText.includes('error') ||
          tcText.includes('terminated')
        ) {
          hasFailure = true;
          break;
        }

        if (tcText.includes('success') || tcText.includes('passed') || tcText.includes('✓')) {
          passedCount++;
        }
      }

      if (!hasFailure && passedCount >= 1) {
        const bodyText = (document.body.innerText || '').toLowerCase();
        // Check if this was a full submission and not a partial run with failures
        if (
          bodyText.includes('submission') ||
          bodyText.includes('congratulations') ||
          !bodyText.includes('sample test case 0')
        ) {
          handleAccepted();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Handles the accepted verdict, extracts all problem metadata, and triggers sync.
   */
  function handleAccepted() {
    const title = extractTitle();
    const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const now = Date.now();

    // Prevent duplicate triggers within 25 seconds for the same challenge
    if (lastProcessedSlug === slug && now - lastProcessedTime < 25000) {
      return;
    }

    lastProcessedTime = now;
    lastProcessedSlug = slug;

    console.log('[AlgoSync] Verified HackerRank Accepted Submission Detected! Extracting data for:', title);

    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

    const submissionData = {
      platform: 'HackerRank',
      problemId: slug || 'hackerrank-challenge',
      title: title || 'HackerRank Problem',
      url: url,
      originalLanguage: originalLanguage || 'Python',
      originalCode: originalCode || '// Original code preserved from HackerRank',
      description: description || 'Refer to HackerRank problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: now
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  /**
   * Extracts the challenge title using DOM selectors, document.title, or URL slug fallback.
   */
  function extractTitle() {
    const titleSelectors = [
      'h1.ui-icon-label',
      'h1.page-label',
      'h1.challenge-header-title',
      'h1.hr_challenge-title',
      '.challenge-header h1',
      'h1'
    ];

    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        const text = el.innerText.trim();
        if (!text.toLowerCase().includes('hackerrank') && text.length > 1) {
          return text;
        }
      }
    }

    // Document title fallback (e.g. "Solve Python If-Else | HackerRank")
    const docTitle = document.title || '';
    if (docTitle.includes('| HackerRank')) {
      let clean = docTitle.split('| HackerRank')[0].trim();
      if (clean.toLowerCase().startsWith('solve ')) {
        clean = clean.substring(6).trim();
      }
      if (clean) return clean;
    }

    // URL slug fallback (e.g. /challenges/simple-array-sum/problem)
    const match = window.location.pathname.match(/\/challenges\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1]
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    }

    return 'HackerRank Problem';
  }

  /**
   * Extracts the challenge problem statement and cleans it into plain text.
   */
  function extractDescription() {
    const descSelectors = [
      '.challenge-body-html',
      '.challenge-content',
      '.problem-statement',
      '.challenge-desc',
      '[data-analytics="ChallengeBody"]',
      '.challenge-statement',
      '.challenge-text'
    ];

    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerHTML) {
        const text = window.AlgoSyncCommon.cleanHtmlToText(el.innerHTML);
        if (text && text.length > 20) {
          return text;
        }
      }
    }

    return 'Refer to HackerRank problem statement.';
  }

  /**
   * Extracts code across Monaco, Ace, CodeMirror, review pre tags, and hidden textareas.
   */
  function extractCode() {
    // 1. Monaco Editor (Modern HackerRank UI)
    const monacoLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (monacoLines && monacoLines.length > 0) {
      const code = Array.from(monacoLines).map(l => l.textContent || '').join('\n').trim();
      if (code) return code;
    }

    // 2. Ace Editor (Classic HackerRank UI)
    const aceLines = document.querySelectorAll(
      '.ace_editor .ace_text-layer .ace_line, .ace_editor .ace_line'
    );
    if (aceLines && aceLines.length > 0) {
      const code = Array.from(aceLines).map(l => l.textContent || '').join('\n').trim();
      if (code) return code;
    }

    // 3. CodeMirror fallback
    const cmLines = document.querySelectorAll('.CodeMirror-code pre, .CodeMirror-line');
    if (cmLines && cmLines.length > 0) {
      const code = Array.from(cmLines).map(l => l.textContent || '').join('\n').trim();
      if (code) return code;
    }

    // 4. Submission review tab / pre tags
    const preCode = document.querySelector('.submission-code pre, pre.code, pre#code, code.hljs');
    if (preCode && preCode.textContent && preCode.textContent.trim().length > 10) {
      return preCode.textContent.trim();
    }

    // 5. Form textareas or hidden code inputs
    const textareas = document.querySelectorAll(
      'textarea[name="code"], textarea.custominput, textarea.hr-monaco-editor'
    );
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 10) {
        return ta.value.trim();
      }
    }

    return '// Original code preserved from HackerRank';
  }

  /**
   * Extracts the selected programming language.
   */
  function extractLanguage() {
    const selectors = [
      'button[data-analytics="SelectLanguage"]',
      'div[class*="select-language"] button',
      'select[class*="language-select"]',
      'div[class*="language-select"]',
      '.select-language-dropdown',
      '.select-language',
      'button.select-language',
      '.css-1hwfws3'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (el.tagName === 'SELECT') {
          const selected = el.options[el.selectedIndex];
          if (selected && selected.text) return cleanLanguageName(selected.text);
        }
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length < 35) {
          return cleanLanguageName(text);
        }
      }
    }

    // Monaco data-mode-id attribute fallback
    const monaco = document.querySelector('.monaco-editor[data-mode-id]');
    if (monaco) {
      const mode = monaco.getAttribute('data-mode-id');
      if (mode) return mapModeToLanguage(mode);
    }

    return 'Python';
  }

  function cleanLanguageName(raw) {
    const lower = raw.toLowerCase();
    if (lower.includes('python3') || lower.includes('python 3')) return 'Python3';
    if (lower.includes('python')) return 'Python';
    if (lower.includes('c++') || lower.includes('cpp')) return 'C++';
    if (lower.includes('java 8') || lower.includes('java 15') || lower.includes('java')) return 'Java';
    if (lower.includes('c#') || lower.includes('csharp')) return 'C#';
    if (lower.includes('javascript') || lower.includes('node')) return 'JavaScript';
    if (lower.includes('typescript')) return 'TypeScript';
    if (lower.includes('go') || lower.includes('golang')) return 'Go';
    if (lower.includes('rust')) return 'Rust';
    if (lower.includes('ruby')) return 'Ruby';
    if (lower.includes('c') && !lower.includes('css')) return 'C';
    return raw.split('\n')[0].trim();
  }

  function mapModeToLanguage(mode) {
    const m = mode.toLowerCase();
    if (m === 'python') return 'Python';
    if (m === 'cpp') return 'C++';
    if (m === 'java') return 'Java';
    if (m === 'javascript') return 'JavaScript';
    if (m === 'typescript') return 'TypeScript';
    if (m === 'csharp') return 'C#';
    if (m === 'go') return 'Go';
    if (m === 'rust') return 'Rust';
    return mode;
  }
})();
