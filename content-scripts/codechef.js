/**
 * CodeChef Content Script
 * Monitors submissions on CodeChef across problem pages, IDE, practice,
 * contests, and solution views.
 * Features:
 * - Capture-phase document click & keyboard hotkey interception (prevents React event cancellation).
 * - Automatic evaluation/running state detection from DOM to recover missed click events.
 * - Cross-page submission intent persistence via sessionStorage.
 * - Active high-frequency polling (350ms) for async verdict evaluation.
 * - Robust multi-selector verdict detection that ignores problem statement text and checks acceptance first.
 * - Monaco, Ace, and CodeMirror editor extraction with strict vertical line offset sorting.
 */

(function () {
  console.log('[AlgoSync] CodeChef content script initialized on:', window.location.href);
  window.AlgoSyncCommon.initHUD('CodeChef');

  const CC_PENDING_KEY = 'algosync_cc_pending_submission';
  let lastProcessed = 0;
  let userSubmittedAt = 0;
  let pollingInterval = null;
  let pollingAttempts = 0;

  // Restore pending submission intent if user submitted and page navigated/redirected
  const pending = getPendingSubmission();
  if (pending) {
    console.log('[AlgoSync] CodeChef restored active submission intent from sessionStorage:', pending.title);
    userSubmittedAt = pending.timestamp;
    startPollingForVerdict();
  }

  // Attach submit listeners to buttons and register global capture click listener
  attachSubmitListeners();
  registerGlobalCaptureListeners();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes
  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    checkRunningSubmission();

    const activeTime = userSubmittedAt || (getPendingSubmission()?.timestamp || 0);
    if (activeTime && (Date.now() - activeTime <= 60000)) {
      if (!userSubmittedAt) userSubmittedAt = activeTime;
      checkCodeChefVerdict();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  /**
   * Global capture-phase listeners intercept clicks and hotkeys before React or
   * other frameworks can call e.stopPropagation() or unmount elements.
   */
  function registerGlobalCaptureListeners() {
    // 1. Capture-phase click listener
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const btn = target.closest(
        'button, [role="button"], a, input[type="submit"], [data-cy*="submit" i], [data-testid*="submit" i], [id*="submit" i], [class*="submit" i]'
      );
      if (!btn) return;

      const text = (
        btn.value ||
        btn.innerText ||
        btn.textContent ||
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.getAttribute('data-cy') ||
        btn.getAttribute('data-testid') ||
        btn.id ||
        btn.className ||
        ''
      ).trim().toLowerCase();

      // Ensure it is a submit button, avoiding custom test runs or unrelated buttons
      if (text.includes('submit') && !text.includes('custom')) {
        console.log('[AlgoSync] CodeChef submit detected via global capture click');
        savePendingSubmission();
      }
    }, true);

    // 2. Capture-phase keydown listener for submit hotkeys (Cmd/Ctrl + Enter)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
        console.log('[AlgoSync] CodeChef submit hotkey detected (capture phase)');
        savePendingSubmission();
      }
    }, true);
  }

  /**
   * Attaches direct click listeners to CodeChef submit buttons across modern IDE and classic pages
   */
  function attachSubmitListeners() {
    const buttons = document.querySelectorAll(
      'button, input[type="submit"], div[role="button"], a[role="button"], [data-cy*="submit"], [data-testid*="submit"], [id*="submit"], [class*="submit"]'
    );
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;
      const text = (
        btn.value ||
        btn.innerText ||
        btn.textContent ||
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        ''
      ).trim().toLowerCase();

      if (text.includes('submit') && !text.includes('custom')) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] CodeChef submit button clicked');
          savePendingSubmission();
        });
      }
    }
  }

  /**
   * Auto-detects if a submission is actively running/evaluating in the DOM,
   * activating userSubmittedAt even if button click was intercepted or missed.
   */
  function checkRunningSubmission() {
    if (userSubmittedAt && Date.now() - userSubmittedAt <= 60000) return;

    const runningIndicators = document.querySelectorAll(
      '[class*="running" i], [class*="evaluating" i], [class*="judging" i], [class*="in-queue" i], [class*="pending" i], [class*="compiling" i], [class*="spinner" i], div[role="status"]'
    );
    for (const el of runningIndicators) {
      if (el.closest('.problem-statement, #problem-statement, .problem-description, #problem-description')) continue;
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (
        text.includes('running') ||
        text.includes('evaluating') ||
        text.includes('judging') ||
        text.includes('in queue') ||
        text.includes('compiling') ||
        text.includes('testing') ||
        text.includes('submitting')
      ) {
        console.log('[AlgoSync] Active CodeChef evaluation in progress detected from DOM:', text);
        savePendingSubmission();
        break;
      }
    }
  }

  /**
   * Saves submission intent and current editor code into sessionStorage before evaluation
   */
  function savePendingSubmission() {
    const code = extractCode();
    const lang = extractLanguage(code);
    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const desc = extractDescription();

    const pendingData = {
      timestamp: Date.now(),
      code: code,
      language: lang,
      title: title,
      url: url,
      description: desc
    };

    try {
      sessionStorage.setItem(CC_PENDING_KEY, JSON.stringify(pendingData));
    } catch (e) {
      console.warn('[AlgoSync] Failed to persist CC pending submission in sessionStorage:', e);
    }

    userSubmittedAt = Date.now();
    startPollingForVerdict();
  }

  /**
   * Retrieves active pending submission from sessionStorage (within 60 seconds)
   */
  function getPendingSubmission() {
    try {
      const raw = sessionStorage.getItem(CC_PENDING_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp < 60000) {
        return data;
      }
      sessionStorage.removeItem(CC_PENDING_KEY);
    } catch {}
    return null;
  }

  /**
   * Starts high-frequency polling every 350ms for up to 50 seconds to catch async verdicts
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkCodeChefVerdict();
      if (found || pollingAttempts >= 140) { // 350ms * 140 ~= 49 seconds
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 350);
  }

  /**
   * Checks the DOM for accepted verdicts across modern IDE results and classic views.
   * Prioritizes accepted detection and skips problem description text to prevent false aborts.
   */
  function checkCodeChefVerdict() {
    if (!userSubmittedAt) {
      userSubmittedAt = getPendingSubmission()?.timestamp || 0;
    }

    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      return false;
    }

    // 1. Check if the evaluation is still in progress (running/evaluating/in-queue)
    const runningEls = document.querySelectorAll(
      '[class*="running" i], [class*="evaluating" i], [class*="judging" i], [class*="in-queue" i], [class*="pending" i], [class*="compiling" i]'
    );
    for (const el of runningEls) {
      if (el.closest('.problem-statement, #problem-statement, .problem-description, #problem-description')) continue;
      const rText = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (rText.includes('running') || rText.includes('evaluating') || rText.includes('judging') || rText.includes('in queue') || rText.includes('compiling')) {
        // Still evaluating, wait for completion
        return false;
      }
    }

    // 2. Select candidate elements that may contain verdict text or status badges
    const candidateSelectors = [
      'div[class*="submission-status"]',
      'div[class*="submission_status"]',
      'div[class*="correctAnswer"]',
      'div[class*="correct_answer"]',
      'div[class*="status-correct"]',
      'div[class*="solution-status"]',
      'span.status-label',
      '.verdict-label',
      '[class*="verdict"]',
      '[class*="result"]',
      '[class*="status"]',
      '[data-cy*="verdict"]',
      '[data-cy*="status"]',
      '[data-testid*="verdict"]',
      '[data-testid*="status"]',
      '.ant-tag-success',
      '.ant-alert-success',
      'div[role="alert"]',
      'div[role="dialog"]',
      '.ant-modal-content',
      '.ant-modal-body',
      'div[class*="console"]',
      'div[class*="drawer"]',
      'table[class*="submission"] tr:first-child',
      'table[class*="status"] tr:first-child',
      'td.status',
      'h1, h2, h3, h4, h5, p, span, strong'
    ];

    const verdictElements = document.querySelectorAll(candidateSelectors.join(', '));

    // 3. FIRST PASS: Scan candidate elements for Accepted / Correct Answer
    for (const el of verdictElements) {
      // Strictly skip elements inside problem statement, comments, and code editor
      if (el.closest('.problem-statement, #problem-statement, .problem-description, #problem-description, div[class*="statement"], .discussions, .comment, #comments, .monaco-editor, .ace_editor, .CodeMirror')) {
        continue;
      }

      const text = (el.innerText || el.textContent || '').trim();
      if (text.length > 300 && !/correct\s*answer/i.test(text.slice(0, 60))) continue;

      const titleAttr = (el.getAttribute('title') || el.getAttribute('data-tooltip') || '').trim();
      const statusAttr = (el.getAttribute('status') || '').trim();

      // Check for accepted verdict patterns
      const isAccepted =
        /correct\s*answer/i.test(text) ||
        /(?:^|\b)(?:accepted)\b/i.test(text) ||
        /100\s*\/\s*100/i.test(text) ||
        /100\s*pts/i.test(text) ||
        /score:\s*100/i.test(text) ||
        /passed\s*all\s*test\s*cases/i.test(text) ||
        titleAttr.toLowerCase() === 'accepted' ||
        statusAttr.toLowerCase() === 'ac';

      // Ensure no negative qualifiers like "not correct answer" or "partially correct"
      const isNegative = /wrong|fail|error|limit|tle|runtime|partially/i.test(text);

      if (isAccepted && !isNegative) {
        handleAccepted(el);
        return true;
      }
    }

    // 4. SECOND PASS: Check for confirmed failure in active result containers only
    const failureContainers = document.querySelectorAll(
      'div[class*="submission-status"], div[class*="submission_status"], [class*="verdict"], [class*="result"], div[role="alert"], .ant-modal-body, .ant-alert-error, table[class*="submission"] tr:first-child td.status'
    );
    for (const el of failureContainers) {
      if (el.closest('.problem-statement, #problem-statement, .problem-description, #problem-description')) continue;
      const text = (el.innerText || el.textContent || '').trim();
      const isFailed =
        /wrong\s*answer/i.test(text) ||
        /time\s*limit\s*exceeded/i.test(text) ||
        /runtime\s*error/i.test(text) ||
        /compilation\s*error/i.test(text);

      if (isFailed) {
        console.log('[AlgoSync] CodeChef submission confirmed failed verdict:', text);
        userSubmittedAt = 0;
        try { sessionStorage.removeItem(CC_PENDING_KEY); } catch {}
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        return false;
      }
    }

    return false;
  }

  /**
   * Handles verified accepted verdict, gathers submission metadata, and triggers sync
   */
  function handleAccepted(contextEl) {
    userSubmittedAt = 0;
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    const pendingData = getPendingSubmission();
    try {
      sessionStorage.removeItem(CC_PENDING_KEY);
    } catch {}

    const now = Date.now();
    if (now - lastProcessed < 20000) return;
    lastProcessed = now;

    console.log('[AlgoSync] CodeChef Accepted Submission Detected!');

    const title = extractTitle(pendingData);
    const url = (pendingData && pendingData.url) || window.location.href.split('?')[0];
    const description = (pendingData && pendingData.description && pendingData.description.length > 20)
      ? pendingData.description
      : extractDescription();

    const originalCode = (pendingData && pendingData.code && pendingData.code.trim().length > 10)
      ? pendingData.code.trim()
      : extractCode();

    const originalLanguage = (pendingData && pendingData.language)
      ? pendingData.language
      : extractLanguage(originalCode);

    const submissionData = {
      platform: 'CodeChef',
      problemId: title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'CodeChef Problem',
      url: url,
      originalLanguage: originalLanguage || 'C++',
      originalCode: originalCode || '// Original code preserved from CodeChef',
      description: description || 'Refer to CodeChef problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: now
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle(pendingData) {
    if (pendingData && pendingData.title && pendingData.title !== 'CodeChef Problem') {
      return pendingData.title;
    }

    const titleSelectors = [
      'h1[class*="problem-title"]',
      'h1[class*="problem__title"]',
      'div[class*="problem-title"]',
      'h1',
      '.problem-code',
      '[data-cy="problem-title"]'
    ];

    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        const text = el.innerText.trim();
        if (!text.toLowerCase().includes('codechef') && text.length > 1) {
          const match = text.match(/^[A-Z0-9_]+\s*[-.]\s*(.+)$/i);
          return match ? match[1].trim() : text;
        }
      }
    }

    const docTitle = document.title || '';
    if (docTitle.includes(' | CodeChef')) {
      const clean = docTitle.split(' | CodeChef')[0].trim();
      const match = clean.match(/^[A-Z0-9_]+\s*[-.]\s*(.+)$/i);
      return match ? match[1].trim() : clean;
    }

    const urlMatch = window.location.pathname.match(/\/(?:problems|submit)\/([A-Za-z0-9_]+)/i);
    if (urlMatch) {
      return urlMatch[1].toUpperCase();
    }

    return 'CodeChef Problem';
  }

  function extractDescription() {
    const descSelectors = [
      'div[class*="problem-statement"]',
      '#problem-statement',
      '.problem-statement',
      'div[class*="problem__statement"]',
      'div[class*="statement"]',
      '[data-cy="problem-statement"]',
      '.problem-description',
      '#problem-description'
    ];

    for (const sel of descSelectors) {
      const descEl = document.querySelector(sel);
      if (descEl && descEl.innerHTML) {
        const cleaned = window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
        if (cleaned && cleaned.length > 20) {
          return cleaned;
        }
      }
    }

    return 'Refer to CodeChef problem statement.';
  }

  function extractCode() {
    // 1. Static solution tag (on viewsolution or submission detail modal)
    const preEl = document.querySelector(
      '.solution-code pre, pre.prettyprint, pre#solution, pre.code, code.hljs'
    );
    if (preEl && preEl.textContent && preEl.textContent.trim().length > 10) {
      return preEl.textContent.trim();
    }

    // 2. Monaco Editor (sorted by vertical line offset via common helper)
    if (window.AlgoSyncCommon?.extractCodeFromMonaco) {
      const monacoCode = window.AlgoSyncCommon.extractCodeFromMonaco(document);
      if (monacoCode && monacoCode.length > 10) return monacoCode;
    }

    // Direct Monaco line fallback sorted by style.top
    const monacoLines = document.querySelectorAll('.monaco-editor .view-line, .view-lines .view-line');
    if (monacoLines && monacoLines.length > 0) {
      const sortedMonaco = Array.from(monacoLines).sort((a, b) => {
        const topA = parseFloat(a.style.top || '0');
        const topB = parseFloat(b.style.top || '0');
        return topA - topB;
      });
      const code = sortedMonaco.map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 3. Ace Editor lines (sorted by vertical offset)
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line, .ace_editor .ace_line');
    if (aceLines && aceLines.length > 0) {
      const sortedAce = Array.from(aceLines).sort((a, b) => {
        const topA = parseFloat(a.style.top || '0');
        const topB = parseFloat(b.style.top || '0');
        return topA - topB;
      });
      const code = sortedAce.map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 4. CodeMirror
    const cmLines = document.querySelectorAll('.CodeMirror-line, .cm-line');
    if (cmLines && cmLines.length > 0) {
      const code = Array.from(cmLines).map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 5. Fallback: Textarea
    const textarea = document.querySelector(
      'textarea#code, textarea[name="code"], textarea.problem-editor__textarea, textarea.inputarea'
    );
    if (textarea && textarea.value && textarea.value.trim().length > 10) {
      return textarea.value.trim();
    }

    return '';
  }

  function extractLanguage(code) {
    const langSelectors = [
      'div[class*="language-select"] [class*="singleValue"]',
      'div[class*="language-select"] button',
      'div[class*="language-select"] span',
      'button[class*="lang-dropdown"]',
      'div[class*="lang-dropdown"]',
      'select[name="language"]',
      'select[class*="language"]',
      '[data-cy="language-select"]',
      '[aria-label*="Language" i]'
    ];

    for (const sel of langSelectors) {
      const langEl = document.querySelector(sel);
      if (langEl) {
        if (langEl.tagName === 'SELECT') {
          const selected = langEl.options[langEl.selectedIndex];
          if (selected && selected.text) {
            const cleaned = cleanLanguageName(selected.text);
            if (cleaned) return cleaned;
          }
        }
        const text = (langEl.innerText || langEl.textContent || '').trim();
        const cleaned = cleanLanguageName(text);
        if (cleaned) return cleaned;
      }
    }

    // Intelligent Code-based Language Analysis fallback
    if (code && window.AlgoSyncCommon?.detectLanguageFromCode) {
      const detected = window.AlgoSyncCommon.detectLanguageFromCode(code);
      if (detected) return detected;
    }

    return 'C++';
  }

  function cleanLanguageName(raw) {
    if (!raw) return '';
    const lower = raw.toLowerCase().trim();
    if (lower.includes('javascript') || lower.includes('node')) return 'JavaScript';
    if (lower.includes('python3') || lower.includes('python 3') || lower.includes('py3')) return 'Python3';
    if (lower.includes('python') || lower.includes('pypy')) return 'Python';
    if (lower.includes('c++') || lower.includes('g++') || lower.includes('clang++') || lower.includes('cpp')) return 'C++';
    if (lower.includes('java')) return 'Java';
    if (lower.includes('rust')) return 'Rust';
    if (lower.includes('c#') || lower.includes('csharp')) return 'C#';
    if (lower.includes('go')) return 'Go';
    if (lower.includes('kotlin')) return 'Kotlin';
    if (lower.includes('c') && !lower.includes('css')) return 'C';
    return raw.split('\n')[0].trim();
  }
})();
