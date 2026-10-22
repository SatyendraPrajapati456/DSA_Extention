/**
 * Codeforces Content Script
 * Monitors submissions on Codeforces across problem pages, contest pages,
 * gym, and status tables.
 * Persists submission intent across Codeforces full-page form redirects
 * using sessionStorage, and tracks asynchronous test case evaluation.
 */

(function () {
  console.log('[AlgoSync] Codeforces content script initialized on:', window.location.href);
  window.AlgoSyncCommon.initHUD('Codeforces');

  const CF_PENDING_KEY = 'algosync_cf_pending_submission';
  let lastProcessed = 0;
  let lastProcessedSubmissionId = '';
  let userSubmittedAt = 0;
  let pollingInterval = null;
  let pollingAttempts = 0;

  // Restore pending submission intent if user just submitted and page navigated
  const pending = getPendingSubmission();
  if (pending) {
    console.log('[AlgoSync] Codeforces restored active submission intent from sessionStorage:', pending.title);
    userSubmittedAt = pending.timestamp;
    startPollingForVerdict();
  }

  attachSubmitListeners();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes (e.g. AJAX verdict updates)
  const observer = new MutationObserver(() => {
    attachSubmitListeners();
    const activeTime = userSubmittedAt || (getPendingSubmission()?.timestamp || 0);
    if (activeTime && (Date.now() - activeTime <= 90000)) {
      if (!userSubmittedAt) userSubmittedAt = activeTime;
      checkCodeforcesVerdict();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for keyboard submit hotkeys (Cmd/Ctrl + Enter)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] Codeforces submit hotkey detected');
      savePendingSubmission();
    }
  });

  /**
   * Attaches listeners to Codeforces submission forms and submit buttons
   * to capture user code, language, and problem metadata before form POST navigation.
   */
  function attachSubmitListeners() {
    // 1. Intercept form submit event
    const forms = document.querySelectorAll('form.submit-form, form[action*="submit"], form[action*="problem"]');
    for (const form of forms) {
      if (form.__algosync_attached) continue;
      form.__algosync_attached = true;
      form.addEventListener('submit', () => {
        console.log('[AlgoSync] Codeforces submit form submitted');
        savePendingSubmission();
      });
    }

    // 2. Intercept submit buttons directly
    const buttons = document.querySelectorAll('input[type="submit"], button[type="submit"], input.submit, button.submit');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;
      const text = (btn.value || btn.innerText || btn.textContent || '').trim().toLowerCase();
      if (text.includes('submit')) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] Codeforces submit button clicked');
          savePendingSubmission();
        });
      }
    }
  }

  /**
   * Saves submission details into sessionStorage so that when Codeforces
   * navigates/redirects to the My Submissions page, the intent and code are preserved.
   */
  function savePendingSubmission() {
    const code = extractCodeFromPage();
    const lang = extractLanguageFromPage(code);
    const title = extractTitleFromProblemPage();
    const url = window.location.href.split('?')[0];
    const desc = extractDescriptionFromProblemPage();

    const pendingData = {
      timestamp: Date.now(),
      code: code,
      language: lang,
      title: title,
      url: url,
      description: desc
    };

    try {
      sessionStorage.setItem(CF_PENDING_KEY, JSON.stringify(pendingData));
    } catch (e) {
      console.warn('[AlgoSync] Failed to persist CF pending submission in sessionStorage:', e);
    }

    userSubmittedAt = Date.now();
    startPollingForVerdict();
  }

  /**
   * Retrieves pending submission from sessionStorage if still active (within 90s).
   */
  function getPendingSubmission() {
    try {
      const raw = sessionStorage.getItem(CF_PENDING_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp < 90000) {
        return data;
      }
      sessionStorage.removeItem(CF_PENDING_KEY);
    } catch {}
    return null;
  }

  /**
   * High-frequency polling every 400ms to monitor Codeforces's async AJAX
   * evaluation table updates (e.g. from "Running on test 1" -> "Accepted").
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkCodeforcesVerdict();
      if (found || pollingAttempts >= 120) { // 400ms * 120 = 48s
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 400);
  }

  /**
   * Checks the DOM for an accepted Codeforces verdict.
   * Supports status tables (/my, /status), problem sidebars, and popups.
   */
  function checkCodeforcesVerdict() {
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

    // Strategy 1: Status Table Rows (Codeforces /my, /status, /submissions, or contest status)
    const tableRows = document.querySelectorAll(
      'table.status-frame-datatable tr[data-submission-id], table.submissions tr[data-submission-id], tr[data-submission-id]'
    );

    if (tableRows.length > 0) {
      // The top data row is the user's latest submission
      const topRow = tableRows[0];
      const subId = topRow.getAttribute('data-submission-id') ||
        topRow.querySelector('td.id-cell a, a[href*="/submission/"]')?.innerText?.trim() || '';

      // If we already synced this exact submission ID, don't re-sync
      if (subId && subId === lastProcessedSubmissionId) {
        return false;
      }

      const statusCell = topRow.querySelector('.status-cell, .status-verdict-cell, td:nth-child(6)');
      const verdictText = (statusCell?.innerText || statusCell?.textContent || '').trim();

      const isStillRunning = /queue|running|testing|judging/i.test(verdictText);
      const isFailed = /wrong|rejected|error|failed|time limit|memory limit/i.test(verdictText);

      // CRITICAL FIX: If the newest submission is still in queue or evaluating tests,
      // we MUST wait. NEVER fall through to older rows or Strategy 2!
      if (isStillRunning) {
        return false;
      }

      // If the newest submission failed, clear submission intent and stop polling
      // to prevent picking up any older accepted submissions from previous attempts.
      if (isFailed) {
        console.log(`[AlgoSync] Codeforces newest submission (${subId}) failed: ${verdictText}`);
        userSubmittedAt = 0;
        try { sessionStorage.removeItem(CF_PENDING_KEY); } catch {}
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        window.AlgoSyncCommon?.showHUD?.('Not Accepted', 'error');
        return false;
      }

      const verdictEl = topRow.querySelector(
        'span.verdict-accepted, td.verdict-accepted, td.status-verdict-cell[submissionverdict="OK"], [submissionverdict="OK"]'
      );
      const isAccepted =
        verdictEl !== null ||
        verdictText === 'Accepted' ||
        verdictText.includes('Accepted') ||
        topRow.getAttribute('submissionverdict') === 'OK';

      if (isAccepted) {
        lastProcessedSubmissionId = subId;
        handleAccepted(topRow, subId);
        return true;
      }

      // If status table exists, NEVER inspect older rows or fall through to Strategy 2
      return false;
    }

    // Strategy 2: Direct accepted verdict badges ONLY if no status table is present (problem page sidebar widget or standalone popup)
    const failedWidget = document.querySelector(
      'span.verdict-rejected, span.verdict-wrong-answer, span.verdict-time-limit-exceeded, span.verdict-compilation-error, span.verdict-runtime-error, [submissionverdict="WRONG_ANSWER"], [submissionverdict="TIME_LIMIT_EXCEEDED"], [submissionverdict="COMPILATION_ERROR"]'
    );
    if (failedWidget) {
      console.log('[AlgoSync] Codeforces standalone failure verdict detected, cancelling polling');
      userSubmittedAt = 0;
      try { sessionStorage.removeItem(CF_PENDING_KEY); } catch {}
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      window.AlgoSyncCommon?.showHUD?.('Not Accepted', 'error');
      return false;
    }

    const verdictSpans = document.querySelectorAll(
      'span.verdict-accepted, td.verdict-cell, span[submissionverdict="OK"], td[submissionverdict="OK"]'
    );

    for (const span of verdictSpans) {
      if (span.closest('tr[data-submission-id]')) continue;
      const text = (span.innerText || span.textContent || '').trim();
      const verdictAttr = span.getAttribute('submissionverdict') || '';
      if (text === 'Accepted' || text.includes('Accepted') || verdictAttr === 'OK' || span.classList.contains('verdict-accepted')) {
        if (!/wrong|error|limit|queue|running/i.test(text)) {
          handleAccepted(span.closest('tr') || span);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extracts submission link URL from table row if available.
   */
  function getSubmissionUrl(contextEl) {
    if (!contextEl) return '';
    const link = contextEl.querySelector?.('td.id-cell a, a[href*="/submission/"]');
    if (link && link.href) return link.href;
    return '';
  }

  /**
   * Fetches submission page to extract exact source code directly from Codeforces.
   */
  async function fetchSubmissionSourceCode(subUrl) {
    if (!subUrl) return '';
    try {
      const resp = await fetch(subUrl, { credentials: 'include' });
      if (!resp.ok) return '';
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const preEl = doc.querySelector(
        '#program-source-text, pre.program-source, pre#program-source, pre.prettyprint, pre#source-code'
      );
      if (preEl && preEl.textContent && preEl.textContent.trim().length > 10) {
        return preEl.textContent.trim();
      }
    } catch (e) {
      console.warn('[AlgoSync] Could not fetch submission source code from URL:', subUrl, e);
    }
    return '';
  }

  /**
   * Handles verified accepted verdict, extracts all problem metadata, and triggers sync.
   */
  async function handleAccepted(contextEl, submissionId) {
    userSubmittedAt = 0;
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    const pendingData = getPendingSubmission();
    try {
      sessionStorage.removeItem(CF_PENDING_KEY);
    } catch {}

    const now = Date.now();
    if (submissionId && submissionId === lastProcessedSubmissionId && (now - lastProcessed < 10000)) return;
    lastProcessed = now;
    if (submissionId) lastProcessedSubmissionId = submissionId;

    console.log('[AlgoSync] Verified Codeforces Accepted Submission Detected! ID:', submissionId || 'N/A');

    const { title, url, problemId } = extractProblemInfo(contextEl, pendingData);
    const description = (pendingData && pendingData.description && pendingData.description.length > 20)
      ? pendingData.description
      : extractDescriptionFromProblemPage();

    // 1. First priority: Try fetching the authentic source code for this exact submission
    let originalCode = '';
    const subUrl = getSubmissionUrl(contextEl);
    if (subUrl) {
      originalCode = await fetchSubmissionSourceCode(subUrl);
    }

    // 2. Second priority: Pending code saved at form submission time
    if (!originalCode && pendingData && pendingData.code && pendingData.code.trim().length > 10) {
      originalCode = pendingData.code.trim();
    }

    // 3. Fallback: Extract from active page DOM
    if (!originalCode) {
      originalCode = extractCodeFromPage();
    }

    const originalLanguage = (pendingData && pendingData.language)
      ? pendingData.language
      : extractLanguageFromPage(originalCode, contextEl);

    const runtime = extractRuntime(contextEl);
    const memory = extractMemory(contextEl);

    const submissionData = {
      platform: 'Codeforces',
      problemId: problemId || title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: title || 'Codeforces Problem',
      url: url || window.location.href.split('?')[0],
      originalLanguage: originalLanguage || 'C++',
      originalCode: originalCode || '// Original code preserved from Codeforces',
      description: description || 'Refer to Codeforces problem statement.',
      runtime: runtime || 'N/A',
      memory: memory || 'N/A',
      submissionId: submissionId || '',
      timestamp: now
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  /**
   * Extracts problem title, problem URL, and slug problem ID from context element or pending submission.
   */
  function extractProblemInfo(contextEl, pendingData) {
    // 1. Try from status table row problem link (e.g. on /contest/1234/my or /problemset/status)
    if (contextEl && contextEl.tagName === 'TR') {
      const probLink = contextEl.querySelector('td[data-problemid] a, a[href*="/problem/"]');
      if (probLink) {
        let titleText = (probLink.innerText || probLink.textContent || '').trim();
        let href = probLink.href ? probLink.href.split('?')[0] : '';
        if (titleText && !titleText.toLowerCase().includes('submissions')) {
          const match = titleText.match(/^[A-Z0-9]+\s*[-.]\s*(.+)$/i);
          const cleanTitle = match ? match[1].trim() : titleText;
          return {
            title: titleText,
            url: href || (pendingData && pendingData.url) || window.location.href.split('?')[0],
            problemId: titleText.toLowerCase().replace(/[^a-z0-9]/g, '-')
          };
        }
      }
    }

    // 2. Try pending submission data cached at submit time
    if (pendingData && pendingData.title && !pendingData.title.toLowerCase().includes('submissions') && pendingData.title !== 'Codeforces Problem') {
      return {
        title: pendingData.title,
        url: pendingData.url || window.location.href.split('?')[0],
        problemId: pendingData.title.toLowerCase().replace(/[^a-z0-9]/g, '-')
      };
    }

    // 3. Fallback: DOM on problem page
    const pageTitle = extractTitleFromProblemPage();
    if (pageTitle && pageTitle !== 'Codeforces Problem' && !pageTitle.toLowerCase().includes('submissions')) {
      return {
        title: pageTitle,
        url: window.location.href.split('?')[0],
        problemId: pageTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')
      };
    }

    // 4. URL pathname fallback (e.g. /contest/1234/problem/A)
    const match = window.location.pathname.match(/\/(?:contest|problemset\/problem)\/(\d+)\/([A-Za-z0-9]+)/i);
    if (match) {
      const codeTitle = `Problem ${match[1]}${match[2].toUpperCase()}`;
      return {
        title: codeTitle,
        url: window.location.href.split('?')[0],
        problemId: `codeforces-${match[1]}${match[2]}`.toLowerCase()
      };
    }

    return {
      title: 'Codeforces Problem',
      url: window.location.href.split('?')[0],
      problemId: 'codeforces-problem'
    };
  }

  function extractTitleFromProblemPage() {
    const titleEl = document.querySelector('div.problem-statement .header .title');
    if (titleEl && titleEl.innerText) {
      return titleEl.innerText.trim();
    }
    const docTitle = document.title || '';
    if (docTitle.includes(' - Codeforces')) {
      const clean = docTitle.split(' - Codeforces')[0].trim();
      if (!clean.toLowerCase().includes('submissions') && !clean.toLowerCase().includes('status')) {
        return clean;
      }
    }
    return '';
  }

  function extractDescriptionFromProblemPage() {
    const descEl = document.querySelector('div.problem-statement');
    if (descEl) {
      return window.AlgoSyncCommon.cleanHtmlToText(descEl.innerHTML);
    }
    return 'Refer to Codeforces problem statement.';
  }

  function extractCodeFromPage() {
    // 1. Check textarea in submit form (most immediate active user input)
    const textarea = document.querySelector('textarea#source, textarea[name="source"]');
    if (textarea && textarea.value && textarea.value.trim().length > 10) {
      return textarea.value.trim();
    }

    // 2. Check ACE editor lines
    const aceLines = document.querySelectorAll('.ace_layer.ace_text-layer .ace_line, .ace_line');
    if (aceLines && aceLines.length > 0) {
      const code = Array.from(aceLines).map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 3. Check facebox modal or pre element (when clicking submission ID)
    const preEl = document.querySelector(
      '#program-source-text, pre.program-source, pre#program-source, pre.prettyprint, pre#source-code, .source-code pre'
    );
    if (preEl && preEl.innerText && preEl.innerText.trim().length > 10) {
      return preEl.innerText.trim();
    }

    return '';
  }

  function extractLanguageFromPage(code, contextEl) {
    // 1. Check status table row language column (5th column)
    if (contextEl && contextEl.tagName === 'TR') {
      const langCell = contextEl.children[4];
      if (langCell && langCell.innerText) {
        return cleanLanguage(langCell.innerText.trim());
      }
    }

    // 2. Check dropdown in submit form
    const langSelect = document.querySelector('select[name="programTypeId"]');
    if (langSelect && langSelect.selectedOptions && langSelect.selectedOptions[0]) {
      return cleanLanguage(langSelect.selectedOptions[0].text.trim());
    }

    // 3. Intelligent code-based detection
    if (code && window.AlgoSyncCommon?.detectLanguageFromCode) {
      const detected = window.AlgoSyncCommon.detectLanguageFromCode(code);
      if (detected) return detected;
    }

    return 'C++';
  }

  function cleanLanguage(raw) {
    if (!raw) return 'C++';
    const lower = raw.toLowerCase();
    if (lower.includes('c++') || lower.includes('g++') || lower.includes('clang++')) return 'C++';
    if (lower.includes('python') || lower.includes('pypy')) return 'Python';
    if (lower.includes('java')) return 'Java';
    if (lower.includes('rust')) return 'Rust';
    if (lower.includes('c#') || lower.includes('csharp')) return 'C#';
    if (lower.includes('go')) return 'Go';
    if (lower.includes('kotlin')) return 'Kotlin';
    if (lower.includes('javascript') || lower.includes('node')) return 'JavaScript';
    if (lower.includes('c') && !lower.includes('css')) return 'C';
    return raw.split('\n')[0].trim();
  }

  function extractRuntime(contextEl) {
    if (contextEl && contextEl.tagName === 'TR') {
      const cell = contextEl.querySelector('.time-consumed-cell, td:nth-child(7)');
      if (cell && cell.innerText) return cell.innerText.trim();
    }
    return 'N/A';
  }

  function extractMemory(contextEl) {
    if (contextEl && contextEl.tagName === 'TR') {
      const cell = contextEl.querySelector('.memory-consumed-cell, td:nth-child(8)');
      if (cell && cell.innerText) return cell.innerText.trim();
    }
    return 'N/A';
  }
})();
