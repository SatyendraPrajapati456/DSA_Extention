/**
 * HackerEarth Content Script
 * Detects "Accepted" / "Correct" evaluation verdict on HackerEarth practice problems,
 * extracts problem details, code, and triggers AlgoSync pipeline.
 */

(function () {
  console.log('[AlgoSync] HackerEarth content script initialized.');
  window.AlgoSyncCommon.initHUD('HackerEarth');

  let lastProcessed = 0;
  let userSubmittedAt = 0;

  attachSubmitListeners();

  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    if (userSubmittedAt && (Date.now() - userSubmittedAt <= 60000)) {
      checkHackerEarthVerdict();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] HackerEarth submit hotkey detected');
      userSubmittedAt = Date.now();
    }
  });

  function attachSubmitListeners() {
    const buttons = document.querySelectorAll('button, input[type="submit"], .btn-blue');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;
      const text = (btn.value || btn.innerText || btn.textContent || '').trim();
      if (text.toLowerCase().includes('submit')) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] HackerEarth submit clicked');
          userSubmittedAt = Date.now();
        });
      }
    }
  }

  function checkHackerEarthVerdict() {
    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      return;
    }

    const verdictBadges = document.querySelectorAll(
      '.verdict-accepted, .weight-700.green-color, span.verdict, div[class*="status-accepted"], h3'
    );

    for (const el of verdictBadges) {
      const text = (el.innerText || '').trim();
      if (text === 'Accepted' || text === 'Correct' || text.includes('Correct Answer')) {
        handleAccepted();
        break;
      }
    }
  }

  function handleAccepted() {
    userSubmittedAt = 0;
    if (Date.now() - lastProcessed < 20000) return;
    lastProcessed = Date.now();

    console.log('[AlgoSync] HackerEarth Accepted Submission Detected!');

    const title = extractTitle();
    const url = window.location.href.split('?')[0];
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();

    const submissionData = {
      platform: 'HackerEarth',
      problemId: title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'HackerEarth Problem',
      url: url,
      originalLanguage: originalLanguage || 'C++',
      originalCode: originalCode || '// Original code preserved from HackerEarth',
      description: description || 'Refer to HackerEarth problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractTitle() {
    const titleEl = document.querySelector('.problem-head, h1.title, .problem-title');
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' | HackerEarth')) {
      return docTitle.split(' | HackerEarth')[0].trim();
    }
    return 'HackerEarth Problem';
  }

  function extractDescription() {
    const descEl = document.querySelector('.problem-description, .challenge-description');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Ace or CodeMirror lines
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line');
    if (aceLines && aceLines.length > 0) {
      return Array.from(aceLines).map(l => l.textContent || '').join('\n');
    }
    const cmLines = document.querySelectorAll('.CodeMirror-code pre');
    if (cmLines && cmLines.length > 0) {
      return Array.from(cmLines).map(l => l.textContent || '').join('\n');
    }
    return '';
  }

  function extractLanguage() {
    const langSelect = document.querySelector('select[name="language"], div[class*="language-selector"]');
    if (langSelect && (langSelect.value || langSelect.innerText)) {
      return (langSelect.value || langSelect.innerText).trim();
    }
    return 'C++';
  }
})();
