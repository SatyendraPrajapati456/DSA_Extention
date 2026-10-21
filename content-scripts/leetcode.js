/**
 * LeetCode Content Script
 * Monitors submissions, detects verified "Accepted" verdicts, extracts problem
 * metadata, submitted code, and triggers the AlgoSync synchronization pipeline.
 */

(function () {
  console.log('[AlgoSync] LeetCode content script initialized.');
  window.AlgoSyncCommon.initHUD('LeetCode');

  let lastProcessedSubmissionId = null;
  let isChecking = false;
  let userSubmittedAt = 0;

  attachSubmitListeners();

  // MutationObserver to watch dynamic DOM changes in submission panel
  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    if (isChecking) return;
    if (userSubmittedAt && (Date.now() - userSubmittedAt <= 60000)) {
      checkSubmissionStatus();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Listen for keyboard submit hotkeys (Cmd/Ctrl + Enter)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] LeetCode submit hotkey detected');
      userSubmittedAt = Date.now();
    }
  });

  function attachSubmitListeners() {
    const buttons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;
      const text = (btn.innerText || btn.textContent || '').trim();
      const locator = btn.getAttribute('data-e2e-locator') || '';
      const cy = btn.getAttribute('data-cypress') || '';
      const isSubmit =
        locator === 'console-submit-button' ||
        cy === 'SubmitCode' ||
        text === 'Submit' ||
        text.startsWith('Submit\n');

      if (isSubmit) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] LeetCode submit button clicked');
          userSubmittedAt = Date.now();
        });
      }
    }
  }

  function checkSubmissionStatus() {
    // Strictly require active user submission within the last 60 seconds
    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      return;
    }

    isChecking = true;
    try {
      // Look for LeetCode's submission result indicators
      const resultContainers = document.querySelectorAll(
        '[data-e2e-locator="submission-result"], .text-green-s, [data-cypress="SubmissionResult"], span.text-green-60'
      );

      for (const container of resultContainers) {
        const text = (container.innerText || container.textContent || '').trim();
        if (text === 'Accepted') {
          handleAcceptedVerdict(container);
          break;
        }
      }
    } finally {
      setTimeout(() => { isChecking = false; }, 1000);
    }
  }

  function handleAcceptedVerdict(container) {
    userSubmittedAt = 0; // Consume submission intent so it cannot fire again
    const problemUrl = window.location.href.split('/submissions')[0].split('?')[0];
    const problemSlug = extractProblemSlug(problemUrl);
    
    // Check submission timestamp/ID or element reference to avoid duplicate triggers
    const submissionId = `${problemSlug}_${Date.now().toString().slice(0, -4)}`;
    if (lastProcessedSubmissionId && Date.now() - lastProcessedSubmissionId < 15000) {
      return;
    }
    lastProcessedSubmissionId = Date.now();

    console.log('[AlgoSync] LeetCode Accepted Submission Detected! Extracting data...');

    // Extract problem metadata
    const title = extractTitle() || problemSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const description = extractDescription();
    const originalCode = extractCode();
    const originalLanguage = extractLanguage();
    const { runtime, memory } = extractStats();

    const submissionData = {
      platform: 'LeetCode',
      problemId: problemSlug,
      title: title,
      url: problemUrl,
      originalLanguage: originalLanguage || 'Java',
      originalCode: originalCode || '// Original code preserved from editor',
      description: description || 'Refer to LeetCode problem description.',
      runtime: runtime || 'N/A',
      memory: memory || 'N/A',
      timestamp: Date.now()
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  function extractProblemSlug(url) {
    const match = url.match(/\/problems\/([^/?]+)/);
    return match ? match[1] : 'leetcode-problem';
  }

  function extractTitle() {
    // Check specific LeetCode title elements
    const titleEl = document.querySelector(
      'div.text-title-large, a.no-underline.hover\\:text-blue-s, .mr-2.text-label-1, h4[data-cy="question-title"]'
    );
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    // Fallback: Parse document title (e.g. "1. Two Sum - LeetCode")
    const docTitle = document.title || '';
    if (docTitle.includes(' - LeetCode')) {
      return docTitle.replace(' - LeetCode', '').trim();
    }
    return '';
  }

  function extractDescription() {
    const descEl = document.querySelector(
      '[data-track-load="description_content"], .elfjS, div._1l1AK, .question-content__JfgR'
    );
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Try to get Monaco editor lines from DOM
    const lineElements = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (lineElements && lineElements.length > 0) {
      const lines = Array.from(lineElements).map(el => el.textContent || el.innerText || '');
      return lines.join('\n');
    }

    // Secondary: Look for submission details pre/code block
    const codeBlock = document.querySelector('pre code, .submission-detail-code, pre.prism-code');
    if (codeBlock && codeBlock.innerText) {
      return codeBlock.innerText;
    }

    return '';
  }

  function extractLanguage() {
    // Check language selector dropdown button
    const langBtn = document.querySelector(
      'button[id*="headlessui-listbox-button"], button.bg-fill-3, [data-cy="lang-select"]'
    );
    if (langBtn && langBtn.innerText) {
      return langBtn.innerText.trim().split('\n')[0];
    }
    return 'Java';
  }

  function extractStats() {
    let runtime = '';
    let memory = '';

    const statsElements = document.querySelectorAll('span, div');
    for (const el of statsElements) {
      const text = el.innerText || '';
      if (!runtime && text.includes('Runtime') && text.includes('ms')) {
        runtime = text.trim();
      }
      if (!memory && text.includes('Memory') && text.includes('MB')) {
        memory = text.trim();
      }
    }

    return { runtime, memory };
  }
})();
