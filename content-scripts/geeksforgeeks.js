/**
 * GeeksforGeeks Content Script
 * Monitors submissions on GFG Practice, detects verified "Problem Solved Successfully",
 * extracts problem statement, accepted code, and initiates AlgoSync pipeline.
 * Features high-frequency active polling and editor state caching for zero-lag detection.
 */

(function () {
  console.log('[AlgoSync] GeeksforGeeks content script initialized.');
  window.AlgoSyncCommon.initHUD('GeeksforGeeks');

  let lastProcessed = 0;
  let isChecking = false;
  let userSubmittedAt = 0;
  let pollingInterval = null;
  let pollingAttempts = 0;
  let cachedSubmissionCode = '';
  let cachedSubmissionLang = '';

  attachSubmitListeners();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes
  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    if (isChecking) return;
    if (userSubmittedAt && (Date.now() - userSubmittedAt <= 60000)) {
      checkGfgSubmission();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for keyboard submit hotkeys (Cmd/Ctrl + Enter)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] GFG submit hotkey detected, initiating active polling...');
      userSubmittedAt = Date.now();
      startPollingForVerdict();
    }
  });

  /**
   * Attaches click listeners to GFG's Submit buttons to trigger high-frequency active polling.
   */
  function attachSubmitListeners() {
    const buttons = document.querySelectorAll('button, div[role="button"], a[role="button"]');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;

      const text = (btn.innerText || btn.textContent || '').trim();
      const aria = btn.getAttribute('aria-label') || '';
      const cls = btn.className || '';
      const isSubmit =
        text === 'Submit' ||
        text === 'Submit Code' ||
        text.startsWith('Submit') ||
        aria.toLowerCase().includes('submit') ||
        cls.includes('problems_submit_btn') ||
        cls.includes('submit-btn');

      if (isSubmit) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] GFG submit button clicked, initiating active polling...');
          userSubmittedAt = Date.now();
          startPollingForVerdict();
        });
      }
    }
  }

  /**
   * High-frequency polling every 350ms for up to 50 seconds to instantly
   * catch GFG's verdict toast as soon as test cases finish evaluating.
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    // Cache code immediately while editor is open and focused
    cachedSubmissionCode = extractCode();
    cachedSubmissionLang = extractLanguage();

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkGfgSubmission();
      if (found || pollingAttempts >= 140) { // 350ms * 140 ~= 49 seconds
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 350);
  }

  /**
   * Evaluates the DOM for GFG success / accepted indicators using targeted selectors.
   */
  function checkGfgSubmission() {
    // Strictly require active user submission within the last 60 seconds
    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      return false;
    }

    isChecking = true;
    try {
      // Fast, targeted selectors (avoid generic 'div' to eliminate layout thrashing)
      const successBadges = document.querySelectorAll(
        '.problems_content__header__toast, .solved_completely, .verdict_accepted, ' +
        '.problem-solved, [class*="problems_content__header__toast"], ' +
        '[class*="problems_header_content__status"], [class*="submission-status"], ' +
        '[class*="problems_verdict"], [class*="toast"], [class*="modal"] h3, ' +
        '[class*="modal"] h4, h1, h2, h3, h4, span.status-label, span.verdict'
      );

      for (const el of successBadges) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length > 250) continue;

        const isMatch =
          text === 'Problem Solved Successfully' ||
          text.includes('Problem Solved Successfully') ||
          text === 'Correct Answer' ||
          text.includes('Correct Answer') ||
          text.includes('All Test Cases Passed') ||
          text.includes('You have passed all test cases');

        if (isMatch) {
          // Guard against compilation/runtime errors or partial solves
          if (!/not|wrong|failed|partially|compile error|runtime error/i.test(text)) {
            handleGfgAccepted();
            return true;
          }
        }
      }
    } finally {
      isChecking = false;
    }
    return false;
  }

  /**
   * Handles verified accepted verdict, extracts metadata, and notifies orchestrator.
   */
  function handleGfgAccepted() {
    userSubmittedAt = 0; // Consume submission intent so it cannot fire again
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] GeeksforGeeks Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode() || cachedSubmissionCode;
    const originalLanguage = extractLanguage() || cachedSubmissionLang;

    const submissionData = {
      platform: 'GeeksforGeeks',
      problemId: title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'GeeksforGeeks Problem',
      url: url,
      originalLanguage: originalLanguage || 'Java',
      originalCode: originalCode || '// Original code preserved from GFG editor',
      description: description || 'Refer to GeeksforGeeks problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle() {
    const titleEl = document.querySelector(
      '.problems_header_content__title__title, h3.problem-title, .problem-heading, h1'
    );
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' | Practice')) {
      return docTitle.split(' | Practice')[0].trim();
    }
    return 'GFG Problem';
  }

  function extractDescription() {
    const descEl = document.querySelector('.problem-statement, .problems_problem_content__X21fA, .problem-content');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // 1. Monaco editor (Modern GFG Practice UI) - sorted by vertical offset
    if (window.AlgoSyncCommon?.extractCodeFromMonaco) {
      const monacoCode = window.AlgoSyncCommon.extractCodeFromMonaco(document);
      if (monacoCode && monacoCode.length > 10) return monacoCode;
    }

    // 2. Ace editor lines (Classic GFG UI)
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line, .ace_line');
    if (aceLines && aceLines.length > 0) {
      const code = Array.from(aceLines).map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 3. Fallback: Textarea
    const textarea = document.querySelector('textarea.problem-editor__textarea, textarea#code');
    if (textarea && textarea.value && textarea.value.trim().length > 10) {
      return textarea.value.trim();
    }

    // 4. Return cached code if editor elements unmounted during result view
    if (cachedSubmissionCode && cachedSubmissionCode.trim().length > 10) {
      return cachedSubmissionCode.trim();
    }

    return '';
  }

  function extractLanguage() {
    const langBtn = document.querySelector('.divider-lang, .problems_language_dropdown, button[id*="language"], div[class*="language-select"]');
    if (langBtn && langBtn.innerText) {
      const raw = langBtn.innerText.trim();
      const lower = raw.toLowerCase();
      if (lower.includes('java') && !lower.includes('script')) return 'Java';
      if (lower.includes('python')) return 'Python';
      if (lower.includes('c++') || lower.includes('cpp')) return 'C++';
      if (lower.includes('rust')) return 'Rust';
      return raw.split('\n')[0].trim();
    }

    if (cachedSubmissionLang) return cachedSubmissionLang;

    return 'Java';
  }
})();
