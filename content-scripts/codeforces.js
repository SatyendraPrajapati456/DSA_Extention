/**
 * Codeforces Content Script
 * Detects "Accepted" verdict in status tables / submission frames,
 * extracts problem details, code, and triggers AlgoSync pipeline.
 */

(function () {
  console.log('[AlgoSync] Codeforces content script initialized.');
  window.AlgoSyncCommon.initHUD('Codeforces');

  let lastProcessed = 0;

  const observer = new MutationObserver(() => {
    checkCodeforcesVerdict();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function checkCodeforcesVerdict() {
    // Check verdict cells in status table or popup
    const verdictSpans = document.querySelectorAll(
      'span.verdict-accepted, td.verdict-cell, span[submissionverdict="OK"]'
    );

    for (const span of verdictSpans) {
      const text = (span.innerText || '').trim();
      if (text === 'Accepted' || span.classList.contains('verdict-accepted')) {
        handleAccepted(span);
        break;
      }
    }
  }

  function handleAccepted(verdictEl) {
    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] Codeforces Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

    const submissionData = {
      platform: 'Codeforces',
      problemId: title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'Codeforces Problem',
      url: url,
      originalLanguage: originalLanguage || 'C++',
      originalCode: originalCode || '// Original code preserved from Codeforces',
      description: description || 'Refer to Codeforces problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle() {
    const titleEl = document.querySelector('div.problem-statement .header .title');
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' - Codeforces')) {
      return docTitle.split(' - Codeforces')[0].trim();
    }
    return 'Codeforces Problem';
  }

  function extractDescription() {
    const descEl = document.querySelector('div.problem-statement');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Check submission source code pre/code
    const preEl = document.querySelector('#source-code, pre.program-source, pre#program-source');
    if (preEl && preEl.innerText) {
      return preEl.innerText;
    }

    // Check textarea in submit form
    const textarea = document.querySelector('textarea#source');
    if (textarea && textarea.value) {
      return textarea.value;
    }

    return '';
  }

  function extractLanguage() {
    const langSelect = document.querySelector('select[name="programTypeId"]');
    if (langSelect && langSelect.selectedOptions && langSelect.selectedOptions[0]) {
      return langSelect.selectedOptions[0].text.trim();
    }
    return 'C++';
  }
})();
