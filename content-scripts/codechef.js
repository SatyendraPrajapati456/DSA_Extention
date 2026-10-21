/**
 * CodeChef Content Script
 * Detects "Correct Answer" / green checkmark verdict, extracts problem details,
 * code, and triggers the AlgoSync pipeline.
 */

(function () {
  console.log('[AlgoSync] CodeChef content script initialized.');
  window.AlgoSyncCommon.initHUD('CodeChef');

  let lastProcessed = 0;

  const observer = new MutationObserver(() => {
    checkCodeChefVerdict();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function checkCodeChefVerdict() {
    const verdictElements = document.querySelectorAll(
      'span.status-label, div.submission-status, .verdict-label, div[class*="correctAnswer"], h3'
    );

    for (const el of verdictElements) {
      const text = (el.innerText || '').trim();
      if (text === 'Correct Answer' || text === 'Accepted' || text.includes('Correct Answer (100 pts)')) {
        handleAccepted();
        break;
      }
    }
  }

  function handleAccepted() {
    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] CodeChef Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

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
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle() {
    const titleEl = document.querySelector('h1[class*="problem-title"], h1, .problem-code');
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' | CodeChef')) {
      return docTitle.split(' | CodeChef')[0].trim();
    }
    return 'CodeChef Problem';
  }

  function extractDescription() {
    const descEl = document.querySelector('div[class*="problem-statement"], #problem-statement');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    const lines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (lines && lines.length > 0) {
      return Array.from(lines).map(l => l.textContent || '').join('\n');
    }
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line');
    if (aceLines && aceLines.length > 0) {
      return Array.from(aceLines).map(l => l.textContent || '').join('\n');
    }
    return '';
  }

  function extractLanguage() {
    const langEl = document.querySelector('div[class*="language-select"], button[class*="lang-dropdown"]');
    if (langEl && langEl.innerText) {
      return langEl.innerText.trim();
    }
    return 'C++';
  }
})();
