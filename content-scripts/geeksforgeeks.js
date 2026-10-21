/**
 * GeeksforGeeks Content Script
 * Monitors submissions on GFG Practice, detects verified "Problem Solved Successfully",
 * extracts problem statement, accepted code, and initiates AlgoSync pipeline.
 */

(function () {
  console.log('[AlgoSync] GeeksforGeeks content script initialized.');
  window.AlgoSyncCommon.initHUD('GeeksforGeeks');

  let lastProcessed = 0;
  let isChecking = false;

  const observer = new MutationObserver(() => {
    if (isChecking) return;
    checkGfgSubmission();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function checkGfgSubmission() {
    isChecking = true;
    try {
      // GFG displays "Problem Solved Successfully" or "Correct Answer" in result modal
      const successBadges = document.querySelectorAll(
        '.problems_content__header__toast, .solved_completely, .verdict_accepted, h4, h3, div'
      );

      for (const el of successBadges) {
        const text = (el.innerText || '').trim();
        if (
          text === 'Problem Solved Successfully' ||
          text.includes('Problem Solved Successfully') ||
          text === 'Correct Answer'
        ) {
          handleGfgAccepted();
          break;
        }
      }
    } finally {
      setTimeout(() => { isChecking = false; }, 1200);
    }
  }

  function handleGfgAccepted() {
    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] GeeksforGeeks Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

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
    const descEl = document.querySelector('.problem-statement, .problems_problem_content__X21fA');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Check Ace editor lines (common on GFG)
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line');
    if (aceLines && aceLines.length > 0) {
      return Array.from(aceLines).map(l => l.textContent || '').join('\n');
    }

    // Check Monaco editor
    const monacoLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (monacoLines && monacoLines.length > 0) {
      return Array.from(monacoLines).map(l => l.textContent || '').join('\n');
    }

    // Fallback: Textarea
    const textarea = document.querySelector('textarea.problem-editor__textarea');
    if (textarea && textarea.value) {
      return textarea.value;
    }

    return '';
  }

  function extractLanguage() {
    const langBtn = document.querySelector('.divider-lang, .problems_language_dropdown, button[id*="language"]');
    if (langBtn && langBtn.innerText) {
      return langBtn.innerText.trim();
    }
    return 'Java';
  }
})();
