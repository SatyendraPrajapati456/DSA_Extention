/**
 * HackerRank Content Script
 * Monitors submissions on HackerRank challenges, detects verified "Congratulations" /
 * "Accepted" verdicts across classic and modern UI variants, extracts challenge metadata,
 * original code (Monaco, Ace, CodeMirror), and initiates the AlgoSync sync pipeline.
 */

(function () {
  console.log('[AlgoSync] HackerRank content script initialized.');
  window.AlgoSyncCommon.initHUD('HackerRank');

  let lastProcessedTime = 0;
  let lastProcessedSlug = '';
  let pollingInterval = null;
  let pollingAttempts = 0;
  let userSubmittedAt = 0;

  // Initial setup - only attach listeners, DO NOT check verdict on page load
  attachSubmitButtonListeners();

  // Dual-layer observation: MutationObserver watches dynamic DOM changes
  const observer = new MutationObserver(() => {
    attachSubmitButtonListeners();
    if (userSubmittedAt && (Date.now() - userSubmittedAt <= 60000)) {
      checkHackerRankVerdict();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for keyboard submit hotkeys (Cmd/Ctrl + Enter)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      console.log('[AlgoSync] HackerRank submit hotkey detected, initiating active polling...');
      userSubmittedAt = Date.now();
      startPollingForVerdict();
    }
  });

  /**
   * Attaches click listeners to HackerRank's "Submit Code" buttons to trigger
   * high-frequency active polling during code evaluation.
   */
  function attachSubmitButtonListeners() {
    const buttons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      if (btn.__algosync_attached) continue;

      const text = (btn.innerText || btn.textContent || '').trim();
      const analytics = btn.getAttribute('data-analytics') || '';
      const isSubmitBtn =
        text === 'Submit Code' ||
        text === 'Submit' ||
        analytics === 'SubmitCode' ||
        btn.classList.contains('hr-monaco-submit') ||
        btn.classList.contains('pull-right-btn');

      if (isSubmitBtn) {
        btn.__algosync_attached = true;
        btn.addEventListener('click', () => {
          console.log('[AlgoSync] HackerRank Submit button clicked, initiating active polling...');
          userSubmittedAt = Date.now();
          startPollingForVerdict();
        });
      }
    }
  }

  /**
   * Starts high-frequency polling every 500ms for up to 40 seconds
   * to catch fast or async verdict renders.
   */
  function startPollingForVerdict() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingAttempts = 0;

    pollingInterval = setInterval(() => {
      pollingAttempts++;
      const found = checkHackerRankVerdict();
      if (found || pollingAttempts >= 80) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, 500);
  }

  /**
   * Evaluates the DOM for multiple HackerRank success / accepted indicators.
   * Returns true if an accepted submission was detected and processed.
   */
  function checkHackerRankVerdict() {
    // Strictly require active user submission within the last 60 seconds
    const now = Date.now();
    if (!userSubmittedAt || (now - userSubmittedAt > 60000)) {
      return false;
    }

    // Strategy 1: Check explicit success headers, banners, and modals
    const candidateSelectors = [
      '.congratulations-heading',
      '.congrats-heading',
      '[data-analytics="SubmissionSuccess"]',
      'div[class*="success-title"]',
      'div[class*="congratulations"]',
      'div[class*="congrats"]',
      'div[class*="submission-success"]',
      'div[class*="status-success"]',
      '.submission-result-header',
      'h1', 'h2', 'h3', 'h4', 'p', 'span', 'div[role="alert"]'
    ];

    const elements = document.querySelectorAll(candidateSelectors.join(', '));

    for (const el of elements) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length > 250) continue;

      // Regex to detect HackerRank success phrases
      const isMatch =
        /congratulations/i.test(text) ||
        /you (?:have )?passed all (?:the )?test cases/i.test(text) ||
        /you solved this challenge/i.test(text) ||
        /you have solved this challenge/i.test(text) ||
        /all test cases passed/i.test(text) ||
        /^accepted$/i.test(text);

      if (isMatch) {
        // Guard against negative phrases like "didn't pass all test cases" or "failed"
        if (!/not|didn't|failed|wrong/i.test(text)) {
          handleAccepted();
          return true;
        }
      }
    }

    // Strategy 2: Test case status aggregation (for classic and contest UIs)
    const testcaseStatusEls = document.querySelectorAll(
      '.testcase-status, [data-analytics*="TestCase"], .test-case-item, div[class*="test-case-status"]'
    );

    if (testcaseStatusEls.length > 0) {
      let passedCount = 0;
      let hasFailure = false;

      for (const tc of testcaseStatusEls) {
        const tcText = (tc.innerText || tc.textContent || '').toLowerCase().trim();
        if (!tcText) continue;

        if (
          tcText.includes('wrong') ||
          tcText.includes('fail') ||
          tcText.includes('error') ||
          tcText.includes('terminated')
        ) {
          hasFailure = true;
          break;
        }

        if (tcText.includes('success') || tcText.includes('passed') || tcText.includes('✓')) {
          passedCount++;
        }
      }

      if (!hasFailure && passedCount >= 1) {
        const bodyText = (document.body.innerText || '').toLowerCase();
        // Check if this was a full submission and not a partial run with failures
        if (
          bodyText.includes('submission') ||
          bodyText.includes('congratulations') ||
          !bodyText.includes('sample test case 0')
        ) {
          handleAccepted();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extracts contest and challenge slugs from HackerRank URL.
   */
  function getHackerRankSlugs() {
    const pathname = window.location.pathname;
    const contestMatch = pathname.match(/\/contests\/([a-zA-Z0-9-_]+)\/challenges\/([a-zA-Z0-9-_]+)/);
    if (contestMatch) {
      return { contestSlug: contestMatch[1], challengeSlug: contestMatch[2] };
    }
    const challengeMatch = pathname.match(/\/challenges\/([a-zA-Z0-9-_]+)/);
    if (challengeMatch) {
      return { contestSlug: 'master', challengeSlug: challengeMatch[1] };
    }
    return { contestSlug: 'master', challengeSlug: '' };
  }

  /**
   * Fetches official challenge details directly from HackerRank REST API.
   * Provides pristine description without MathJax SVG and CSS artifacts.
   */
  async function fetchChallengeDetails(contestSlug, challengeSlug) {
    if (!challengeSlug) return null;
    const contest = contestSlug || 'master';
    try {
      const resp = await fetch(`/rest/contests/${contest}/challenges/${challengeSlug}`, { credentials: 'include' });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.model || null;
    } catch (e) {
      console.warn('[AlgoSync] Failed to fetch HackerRank challenge details via REST:', e);
      return null;
    }
  }

  /**
   * Formats challenge description from HackerRank API model into clean, readable text.
   */
  function formatDescriptionFromModel(model) {
    if (!model) return '';
    const parts = [];
    if (model.problem_statement) {
      parts.push(window.AlgoSyncCommon.cleanHtmlToText(model.problem_statement));
    }
    if (model.input_format) {
      parts.push('Input Format:\n' + window.AlgoSyncCommon.cleanHtmlToText(model.input_format));
    }
    if (model.constraints) {
      parts.push('Constraints:\n' + window.AlgoSyncCommon.cleanHtmlToText(model.constraints));
    }
    if (model.output_format) {
      parts.push('Output Format:\n' + window.AlgoSyncCommon.cleanHtmlToText(model.output_format));
    }
    return parts.filter(Boolean).join('\n\n').trim();
  }

  /**
   * Fetches latest authentic user submission directly from HackerRank REST API.
   * Returns exact un-scrambled, un-virtualized source code and language.
   */
  async function fetchLatestSubmission(contestSlug, challengeSlug) {
    if (!challengeSlug) return null;
    const contest = contestSlug || 'master';
    try {
      const listUrl = `/rest/contests/${contest}/challenges/${challengeSlug}/submissions/?offset=0&limit=10`;
      const resp = await fetch(listUrl, { credentials: 'include' });
      if (!resp.ok) return null;
      const data = await resp.json();
      const models = data?.models;
      if (!Array.isArray(models) || models.length === 0) return null;

      // Find accepted submission or most recent submission
      const sub = models.find(m => m.status === 'Accepted' || m.status === 'accepted' || m.score === 1 || m.score > 0) || models[0];
      if (!sub || !sub.id) return null;

      const detailUrl = `/rest/contests/${contest}/challenges/${challengeSlug}/submissions/${sub.id}`;
      const detResp = await fetch(detailUrl, { credentials: 'include' });
      if (!detResp.ok) return null;
      const detData = await detResp.json();
      const detModel = detData?.model;
      if (detModel && detModel.code && detModel.code.trim().length > 10) {
        return {
          code: detModel.code.trim(),
          language: detModel.language || cleanLanguageName(sub.language || ''),
          id: sub.id
        };
      }
    } catch (e) {
      console.warn('[AlgoSync] Failed to fetch latest HackerRank submission via REST:', e);
    }
    return null;
  }

  /**
   * Handles the accepted verdict, extracts all problem metadata, and triggers sync.
   */
  async function handleAccepted() {
    const title = extractTitle();
    const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const now = Date.now();

    // Prevent duplicate triggers within 25 seconds for the same challenge
    if (lastProcessedSlug === slug && now - lastProcessedTime < 25000) {
      return;
    }

    lastProcessedTime = now;
    lastProcessedSlug = slug;
    userSubmittedAt = 0; // Consume submission intent so it cannot fire again

    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }

    console.log('[AlgoSync] Verified HackerRank Accepted Submission Detected! Extracting data for:', title);

    const url = window.location.href.split('?')[0];
    const { contestSlug, challengeSlug } = getHackerRankSlugs();

    // 1. Fetch clean challenge description from official REST API model if available
    const challengeModel = await fetchChallengeDetails(contestSlug, challengeSlug);
    let description = formatDescriptionFromModel(challengeModel);
    if (!description || description.length < 20) {
      description = extractDescription();
    }

    // 2. Fetch authentic source code and language from HackerRank REST API
    let originalCode = '';
    let originalLanguage = '';
    const subData = await fetchLatestSubmission(contestSlug, challengeSlug);
    if (subData && subData.code && subData.code.trim().length > 10) {
      originalCode = subData.code.trim();
      originalLanguage = cleanLanguageName(subData.language || '');
    }

    // 3. Fallbacks if REST API was unavailable
    if (!originalCode) {
      originalCode = extractCode();
    }
    if (!originalLanguage) {
      originalLanguage = extractLanguage(originalCode);
    }

    const submissionData = {
      platform: 'HackerRank',
      problemId: slug || 'hackerrank-challenge',
      title: title || 'HackerRank Problem',
      url: url,
      originalLanguage: originalLanguage || 'Java',
      originalCode: originalCode || '// Original code preserved from HackerRank',
      description: description || 'Refer to HackerRank problem statement.',
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: now
    };

    window.AlgoSyncCommon.notifyAcceptedSubmission(submissionData);
  }

  /**
   * Extracts the challenge title using DOM selectors, document.title, or URL slug fallback.
   */
  function extractTitle() {
    const titleSelectors = [
      'h1.ui-icon-label',
      'h1.page-label',
      'h1.challenge-header-title',
      'h1.hr_challenge-title',
      '.challenge-header h1',
      'h1'
    ];

    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        const text = el.innerText.trim();
        if (!text.toLowerCase().includes('hackerrank') && text.length > 1) {
          return text;
        }
      }
    }

    // Document title fallback (e.g. "Solve Python If-Else | HackerRank")
    const docTitle = document.title || '';
    if (docTitle.includes('| HackerRank')) {
      let clean = docTitle.split('| HackerRank')[0].trim();
      if (clean.toLowerCase().startsWith('solve ')) {
        clean = clean.substring(6).trim();
      }
      if (clean) return clean;
    }

    // URL slug fallback (e.g. /challenges/simple-array-sum/problem)
    const match = window.location.pathname.match(/\/challenges\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1]
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    }

    return 'HackerRank Problem';
  }

  /**
   * Extracts the challenge problem statement and cleans it into plain text.
   */
  function extractDescription() {
    const descSelectors = [
      '.challenge-body-html',
      '.challenge-content',
      '.problem-statement',
      '.challenge-desc',
      '[data-analytics="ChallengeBody"]',
      '.challenge-statement',
      '.challenge-text'
    ];

    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerHTML) {
        const text = window.AlgoSyncCommon.cleanHtmlToText(el.innerHTML);
        if (text && text.length > 20) {
          return text;
        }
      }
    }

    return 'Refer to HackerRank problem statement.';
  }

  /**
   * Extracts code across review pre tags, Monaco (sorted by top), Ace, CodeMirror, and textareas.
   */
  function extractCode() {
    // 1. Submission review tab / pre tags (most authentic full static code on page)
    const preCode = document.querySelector(
      '.submission-code pre, pre.code, pre#code, .submissions-details pre, .challenge-submission-code pre, code.hljs'
    );
    if (preCode && preCode.textContent && preCode.textContent.trim().length > 10) {
      return preCode.textContent.trim();
    }

    // 2. Monaco Editor (sorted by style.top to avoid scrambled lines)
    if (window.AlgoSyncCommon?.extractCodeFromMonaco) {
      const monacoCode = window.AlgoSyncCommon.extractCodeFromMonaco(document);
      if (monacoCode && monacoCode.length > 10) return monacoCode;
    }

    // 3. Ace Editor (Classic HackerRank UI, sorted by top offset)
    const aceLines = document.querySelectorAll(
      '.ace_editor .ace_text-layer .ace_line, .ace_editor .ace_line'
    );
    if (aceLines && aceLines.length > 0) {
      const sortedAce = Array.from(aceLines).sort((a, b) => {
        const topA = parseFloat(a.style.top || '0');
        const topB = parseFloat(b.style.top || '0');
        return topA - topB;
      });
      const code = sortedAce.map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 4. CodeMirror fallback
    const cmLines = document.querySelectorAll('.CodeMirror-code pre, .CodeMirror-line');
    if (cmLines && cmLines.length > 0) {
      const code = Array.from(cmLines).map(l => l.textContent || '').join('\n').trim();
      if (code && code.length > 10) return code;
    }

    // 5. Form textareas or hidden code inputs
    const textareas = document.querySelectorAll(
      'textarea[name="code"], textarea.custominput, textarea.hr-monaco-editor'
    );
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 10) {
        return ta.value.trim();
      }
    }

    return '// Original code preserved from HackerRank';
  }

  /**
   * Extracts the selected programming language using DOM dropdowns,
   * editor attributes, and intelligent code syntax analysis.
   */
  function extractLanguage(code) {
    let detectedFromDom = '';

    const selectors = [
      'button[data-analytics="SelectLanguage"]',
      'div[data-analytics="SelectLanguage"]',
      'div[class*="select-language"] [class*="singleValue"]',
      'div[class*="select-language"] button',
      'div[class*="select-language"] span',
      'div.select-language-dropdown [class*="singleValue"]',
      'div.select-language-dropdown',
      'div.select-language',
      'select[class*="language-select"]',
      'select.select-language',
      'select[name="language"]',
      'select.hr_select-language',
      'div[class*="LanguageSelect"] [class*="singleValue"]',
      'div[class*="LanguageSelect"]',
      'div[class*="language-select"]',
      '.select-language-dropdown',
      '.select-language',
      'button.select-language',
      '[class*="singleValue"]',
      '[class*="Select-value"]',
      '.css-1uccc91-singleValue',
      '.css-1hwfws3',
      'div[data-automation*="language"]',
      '[aria-label*="Language" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (el.tagName === 'SELECT') {
          const selected = el.options[el.selectedIndex];
          if (selected && selected.text) {
            detectedFromDom = cleanLanguageName(selected.text);
            if (detectedFromDom) break;
          }
        }
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length > 0 && text.length < 35) {
          const cleaned = cleanLanguageName(text);
          if (cleaned) {
            detectedFromDom = cleaned;
            break;
          }
        }
      }
    }

    // Monaco data-mode-id attribute fallback
    if (!detectedFromDom) {
      const monaco = document.querySelector('.monaco-editor[data-mode-id], [data-mode-id]');
      if (monaco) {
        const mode = monaco.getAttribute('data-mode-id');
        if (mode) detectedFromDom = mapModeToLanguage(mode);
      }
    }

    // Intelligent Code-based Language Analysis
    const detectedFromCode = window.AlgoSyncCommon?.detectLanguageFromCode ?
      window.AlgoSyncCommon.detectLanguageFromCode(code) : null;

    console.log('[AlgoSync] HackerRank Language Resolution:', { detectedFromDom, detectedFromCode });

    // Prioritize unambiguous code analysis if DOM extraction is absent, generic, or conflicting
    if (detectedFromCode) {
      if (!detectedFromDom) {
        return detectedFromCode;
      }
      // If code is unequivocally Java (import java., public class, etc.) but DOM says something else:
      if (detectedFromCode === 'Java' && detectedFromDom !== 'Java') {
        console.warn(`[AlgoSync] Overriding DOM language "${detectedFromDom}" with code analysis "Java"`);
        return 'Java';
      }
      if (detectedFromCode === 'C++' && detectedFromDom !== 'C++') {
        console.warn(`[AlgoSync] Overriding DOM language "${detectedFromDom}" with code analysis "C++"`);
        return 'C++';
      }
      if (detectedFromCode === 'Python' && !detectedFromDom.startsWith('Python')) {
        return 'Python';
      }
    }

    if (detectedFromDom) return detectedFromDom;
    if (detectedFromCode) return detectedFromCode;

    return 'Java';
  }

  function cleanLanguageName(raw) {
    if (!raw) return '';
    const lower = raw.toLowerCase().trim();

    // Note: check 'javascript' before 'java' because 'javascript' contains 'java'
    if (lower.includes('javascript') || lower.includes('node')) return 'JavaScript';
    if (lower.includes('typescript')) return 'TypeScript';
    if (lower.includes('python3') || lower.includes('python 3')) return 'Python3';
    if (lower.includes('python') || lower.includes('pypy')) return 'Python';
    if (lower.includes('c++') || lower.includes('cpp')) return 'C++';
    if (lower.includes('c#') || lower.includes('csharp')) return 'C#';
    if (lower.includes('java')) return 'Java'; // matches 'Java 8', 'Java 15', 'Java 7', 'Java'
    if (lower.includes('rust')) return 'Rust';
    if (lower.includes('go') || lower.includes('golang')) return 'Go';
    if (lower.includes('kotlin')) return 'Kotlin';
    if (lower.includes('swift')) return 'Swift';
    if (lower.includes('scala')) return 'Scala';
    if (lower.includes('ruby')) return 'Ruby';
    if (lower.includes('c') && !lower.includes('css')) return 'C';

    return raw.split('\n')[0].trim();
  }

  function mapModeToLanguage(mode) {
    if (!mode) return 'Java';
    const m = mode.toLowerCase();
    if (m === 'python') return 'Python';
    if (m === 'cpp') return 'C++';
    if (m === 'java') return 'Java';
    if (m === 'javascript') return 'JavaScript';
    if (m === 'typescript') return 'TypeScript';
    if (m === 'csharp') return 'C#';
    if (m === 'go') return 'Go';
    if (m === 'rust') return 'Rust';
    return mode;
  }
})();
