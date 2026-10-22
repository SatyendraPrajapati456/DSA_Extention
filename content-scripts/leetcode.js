/**
 * LeetCode Content Script
 * Monitors submissions, detects verified "Accepted" verdicts with zero lag,
 * extracts problem metadata and submitted code, and triggers the AlgoSync pipeline.
 * Features high-frequency active polling (300ms) and editor state pre-caching.
 */

(function () {
  console.log('[AlgoSync] LeetCode content script initialized.');
  window.AlgoSyncCommon.initHUD('LeetCode');

  let lastProcessedSubmissionId = null;
  let userSubmittedAt = 0;
  let pollingInterval = null;
  let pollingAttempts = 0;
  let cachedSubmissionCode = '';
  let cachedSubmissionLang = '';
  let cachedTitle = '';
  let cachedDescription = '';

  // Pre-cache problem details while description tab is active
  setTimeout(() => {
    cachedTitle = extractTitle();
    cachedDescription = extractDescription();
  }, 1000);

  attachSubmitListeners();
  registerGlobalCaptureListeners();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes in submission panel
  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    checkRunningSubmission();
    if (userSubmittedAt && (Date.now() - userSubmittedAt <= 60000)) {
      checkSubmissionStatus();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  /**
   * Global capture-phase listeners intercept clicks and hotkeys before React or
   * other frameworks can call e.stopPropagation().
   */
  function registerGlobalCaptureListeners() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;

      let curr = target;
      let isSubmit = false;
      for (let i = 0; i < 6 && curr && curr !== document.body; i++) {
        const text = (curr.innerText || curr.textContent || '').trim().toLowerCase();
        const locator = (curr.getAttribute?.('data-e2e-locator') || '').toLowerCase();
        const cy = (curr.getAttribute?.('data-cypress') || '').toLowerCase();
        const aria = (curr.getAttribute?.('aria-label') || '').toLowerCase();
        const testId = (curr.getAttribute?.('data-testid') || '').toLowerCase();
        const cls = (curr.className || '').toString().toLowerCase();

        if (
          locator === 'console-submit-button' ||
          locator.includes('submit') ||
          cy === 'submitcode' ||
          cy.includes('submit') ||
          testId.includes('submit') ||
          aria.includes('submit') ||
          cls.includes('submit') ||
          text === 'submit' ||
          text.startsWith('submit') ||
          (text.includes('submit') && !text.includes('custom') && text.length < 30)
        ) {
          isSubmit = true;
          break;
        }
        curr = curr.parentElement;
      }

      if (isSubmit) {
        console.log('[AlgoSync] LeetCode submit button clicked (capture phase)');
        handleUserSubmit();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
        console.log('[AlgoSync] LeetCode submit hotkey detected');
        handleUserSubmit();
      }
    }, true);
  }

  function attachSubmitListeners() {
    const buttons = document.querySelectorAll(
      'button, div[role="button"], [data-e2e-locator*="submit"], [data-cypress*="submit" i], [data-testid*="submit" i], [class*="submit" i], [aria-label*="submit" i]'
    );
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const locator = (btn.getAttribute('data-e2e-locator') || '').toLowerCase();
      const cy = (btn.getAttribute('data-cypress') || '').toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const cls = (btn.className || '').toString().toLowerCase();

      const isSubmit =
        locator === 'console-submit-button' ||
        locator.includes('submit') ||
        cy === 'submitcode' ||
        cy.includes('submit') ||
        testId.includes('submit') ||
        aria.includes('submit') ||
        cls.includes('submit') ||
        text === 'submit' ||
        text.startsWith('submit') ||
        (text.includes('submit') && !text.includes('custom') && text.length < 30);

      if (isSubmit) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] LeetCode submit button clicked');
          handleUserSubmit();
        });
      }
    }
  }

  /**
   * Auto-detects if LeetCode is actively evaluating (Pending / Judging),
   * activating userSubmittedAt even if the button click wasn't caught.
   */
  function checkRunningSubmission() {
    if (userSubmittedAt && Date.now() - userSubmittedAt <= 60000) return;

    const runningEls = document.querySelectorAll(
      '[data-e2e-locator="submission-result"], [class*="evaluating" i], [class*="judging" i], [class*="pending" i], [class*="running" i], [class*="loading" i], .text-yellow-60, .text-yellow-s, div[role="status"]'
    );
    for (const el of runningEls) {
      if (el.closest('.description__24qC, [data-track-load="description_content"], .elfjS')) continue;
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (text.includes('judging') || text.includes('pending') || text.includes('evaluating') || text.includes('running')) {
        console.log('[AlgoSync] Active LeetCode judging in progress detected:', text);
        handleUserSubmit();
        break;
      }
    }
  }

  function handleUserSubmit() {
    userSubmittedAt = Date.now();
    // Cache editor code and metadata immediately while editor is open and focused
    cachedSubmissionCode = extractCode();
    cachedSubmissionLang = extractLanguage();
    const t = extractTitle();
    if (t) cachedTitle = t;
    const d = extractDescription();
    if (d) cachedDescription = d;

    window.AlgoSyncCommon?.updateHUD?.('syncing', 'AlgoSync: Monitoring submission...');
    startPollingForVerdict();
  }

  /**
   * High-frequency polling every 250ms for up to 50 seconds to instantly
   * catch LeetCode's verdict the millisecond it renders.
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkSubmissionStatus();
      if (found || pollingAttempts >= 200) { // 250ms * 200 = 50s
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 250);
  }

  function checkSubmissionStatus() {
    // Strictly require active user submission within the last 60 seconds
    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      return false;
    }

    try {
      // 1. Check if evaluation is actively in progress (Judging / Pending)
      const runningEls = document.querySelectorAll(
        '[data-e2e-locator="submission-result"], [class*="evaluating" i], [class*="judging" i], [class*="pending" i], [class*="running" i], div[role="status"]'
      );
      for (const el of runningEls) {
        if (el.closest('.description__24qC, [data-track-load="description_content"], .elfjS, table, tbody')) continue;
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (text.includes('judging') || text.includes('pending') || text.includes('evaluating') || text.includes('running')) {
          // Still actively judging; do not evaluate verdicts yet
          return false;
        }
      }

      // 2. Check for verified Accepted verdict across standard and modern LeetCode UI
      const acceptedCandidates = document.querySelectorAll(
        '[data-e2e-locator="submission-result"], [data-cypress="SubmissionResult"], .text-green-s, [class*="text-green"], [class*="text-olive"], [class*="text-sd-success"], [class*="text-emerald"], [class*="success"]'
      );

      for (const container of acceptedCandidates) {
        // Exclude historical submission tables, sidebars, and problem descriptions
        if (container.closest('.description__24qC, [data-track-load="description_content"], .elfjS, table, tbody, [class*="submission-list"]')) {
          continue;
        }
        const text = (container.innerText || container.textContent || '').trim();
        if (
          text === 'Accepted' ||
          (/^accepted\b/i.test(text) && !/wrong|rate|%|\/|submissions|accepted\s*solutions/i.test(text))
        ) {
          handleAcceptedVerdict(container);
          return true;
        }
      }

      // 3. Fallback: Check active console result container directly
      const consoleResult = document.querySelector(
        '[data-e2e-locator="console-result"], .result-container, [data-layout-path*="result"]'
      );
      if (consoleResult) {
        const text = (consoleResult.innerText || consoleResult.textContent || '').trim();
        if (
          text.includes('Accepted') &&
          !text.includes('Wrong Answer') &&
          !text.includes('Time Limit') &&
          !text.includes('Runtime Error') &&
          !text.includes('Compile Error')
        ) {
          if (!text.toLowerCase().includes('judging') && !text.toLowerCase().includes('pending')) {
            handleAcceptedVerdict(consoleResult);
            return true;
          }
        }
      }

      // 4. Check for failure verdict strictly on active submission containers
      // Guarded by at least 600ms elapsed since submit to ignore stale previous errors
      if (now - userSubmittedAt >= 600) {
        const failureContainers = document.querySelectorAll(
          '[data-e2e-locator="submission-result"], [data-cypress="SubmissionResult"], [data-e2e-locator="console-result"] [class*="text-red"], .result-container [class*="text-red"], [data-e2e-locator="console-result"] .text-red-s'
        );
        for (const el of failureContainers) {
          if (el.closest('.description__24qC, [data-track-load="description_content"], .elfjS, table, tbody, [class*="submission-list"]')) {
            continue;
          }
          const text = (el.innerText || el.textContent || '').trim();
          if (/wrong\s*answer|time\s*limit|runtime\s*error|compile\s*error|memory\s*limit/i.test(text)) {
            console.log('[AlgoSync] LeetCode submission was NOT accepted:', text);
            userSubmittedAt = 0;
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
            window.AlgoSyncCommon?.updateHUD?.('ready', `AlgoSync: Not Accepted (${text.slice(0, 20)})`);
            setTimeout(() => {
              window.AlgoSyncCommon?.updateHUD?.('ready', 'AlgoSync: Auto-sync Ready');
            }, 4000);
            return false;
          }
        }
      }
    } catch (e) {
      console.warn('[AlgoSync] LeetCode verdict check error:', e);
    }
    return false;
  }

  function handleAcceptedVerdict(container) {
    userSubmittedAt = 0; // Consume submission intent so it cannot fire again
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    const problemUrl = window.location.href.split('/submissions')[0].split('?')[0];
    const problemSlug = extractProblemSlug(problemUrl);
    
    // Check submission timestamp/ID or element reference to avoid duplicate triggers
    if (lastProcessedSubmissionId && Date.now() - lastProcessedSubmissionId < 15000) {
      return;
    }
    lastProcessedSubmissionId = Date.now();

    console.log('[AlgoSync] LeetCode Accepted Submission Detected! Extracting data...');
    window.AlgoSyncCommon?.updateHUD?.('syncing', 'AlgoSync: Accepted! Generating .md file...');

    // Extract problem metadata with cached fallback
    const title = extractTitle() || cachedTitle || problemSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const description = extractDescription() || cachedDescription || 'Refer to LeetCode problem description.';
    const originalCode = (cachedSubmissionCode && cachedSubmissionCode.trim().length > 10)
      ? cachedSubmissionCode
      : extractCode();
    const originalLanguage = cachedSubmissionLang || extractLanguage();
    const { runtime, memory } = extractStats();

    const submissionData = {
      platform: 'LeetCode',
      problemId: problemSlug,
      title: title,
      url: problemUrl,
      originalLanguage: originalLanguage || 'Java',
      originalCode: originalCode || '// Original code preserved from editor',
      description: description,
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
      'div.text-title-large, a.no-underline.hover\\:text-blue-s, .mr-2.text-label-1, h4[data-cy="question-title"], [data-cy="question-title"], [data-e2e-locator="question-title"]'
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
      '[data-track-load="description_content"], [data-key="description-content"], .elfjS, div._1l1AK, .question-content__JfgR, [class*="description_content"]'
    );
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return '';
  }

  function extractCode() {
    // Try to get Monaco editor lines from DOM (sorted by vertical offset)
    if (window.AlgoSyncCommon?.extractCodeFromMonaco) {
      const monacoCode = window.AlgoSyncCommon.extractCodeFromMonaco(document);
      if (monacoCode && monacoCode.length > 10) return monacoCode;
    }
    const lineElements = document.querySelectorAll('.monaco-editor .view-lines .view-line');
    if (lineElements && lineElements.length > 0) {
      const sorted = Array.from(lineElements).sort((a, b) => {
        const topA = parseFloat(a.style.top || '0');
        const topB = parseFloat(b.style.top || '0');
        return topA - topB;
      });
      return sorted.map(el => el.textContent || el.innerText || '').join('\n');
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
      'button[id*="headlessui-listbox-button"], [data-e2e-locator="lang-select"], button.bg-fill-3, button[aria-haspopup="listbox"], [data-cy="lang-select"]'
    );
    if (langBtn && langBtn.innerText) {
      return langBtn.innerText.trim().split('\n')[0];
    }
    return 'Java';
  }

  function extractStats() {
    let runtime = '';
    let memory = '';

    const statsElements = document.querySelectorAll(
      '[data-e2e-locator="submission-result"] span, [data-e2e-locator="submission-result"] div, [data-e2e-locator="console-result"] span, [data-e2e-locator="console-result"] div, .result-container span, .result-container div'
    );
    for (const el of statsElements) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!runtime && text.includes('Runtime') && (text.includes('ms') || text.includes('Beats'))) {
        runtime = text;
      }
      if (!memory && text.includes('Memory') && (text.includes('MB') || text.includes('Beats'))) {
        memory = text;
      }
    }

    if (!runtime || !memory) {
      const allEls = document.querySelectorAll('span, div');
      for (const el of allEls) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!runtime && text.startsWith('Runtime') && text.includes('ms')) {
          runtime = text;
        }
        if (!memory && text.startsWith('Memory') && text.includes('MB')) {
          memory = text;
        }
      }
    }

    return { runtime, memory };
  }
})();
