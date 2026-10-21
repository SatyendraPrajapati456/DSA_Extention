/**
 * HackerRank Content Script
 * Detects "Congratulations!" / all test cases passed banner,
 * extracts problem statement, accepted code, and triggers AlgoSync pipeline.
 */

(function () {
  console.log('[AlgoSync] HackerRank content script initialized.');
  window.AlgoSyncCommon.initHUD('HackerRank');

  let lastProcessed = 0;

  const observer = new MutationObserver(() => {
    checkHackerRankVerdict();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function checkHackerRankVerdict() {
    const successBanners = document.querySelectorAll(
      '.congrats-heading, .submission-success, h2, h3, div[class*="success-title"]'
    );

    for (const el of successBanners) {
      const text = (el.innerText || '').trim();
      if (
        text.includes('Congratulations') ||
        text.includes('You have passed all the test cases') ||
        text === 'Accepted'
      ) {
        handleAccepted();
        break;
      }
    }
  }

  function handleAccepted() {
    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] HackerRank Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

    const submissionData = {
      platform: 'HackerRank',
      problemId: title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'HackerRank Problem',
      url: url,
      originalLanguage: originalLanguage || 'Python',
      originalCode: originalCode || '// Original code preserved from HackerRank',
      description: description || 'Refer to HackerRank problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle() {
    const titleEl = document.querySelector('h1.ui-icon-label, h1.page-label, h1');
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' | HackerRank')) {
      return docTitle.split(' | HackerRank')[0].trim();
    }
    return 'HackerRank Problem';
  }

  function extractDescription() {
    const descEl = document.querySelector('.challenge-body-html, .challenge-content');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Monaco editor on HackerRank
    const lines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (lines && lines.length > 0) {
      return Array.from(lines).map(l => l.textContent || '').join('\n');
    }
    // CodeMirror fallback
    const cmLines = document.querySelectorAll('.CodeMirror-code pre');
    if (cmLines && cmLines.length > 0) {
      return Array.from(cmLines).map(l => l.textContent || '').join('\n');
    }
    return '';
  }

  function extractLanguage() {
    const langSelect = document.querySelector('div[class*="select-language"] button, select[class*="language-select"]');
    if (langSelect && langSelect.innerText) {
      return langSelect.innerText.trim();
    }
    return 'Python';
  }
})();
