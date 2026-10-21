/**
 * AlgoSync Options & Dashboard Controller
 */

import { StorageManager } from '../src/storage/storageManager.js';
import { AI_PROVIDERS, AI_MODELS, DEFAULT_SETTINGS, getDefaultPlatformPaths, SUPPORTED_PLATFORMS } from '../src/constants/defaultSettings.js';
import { TemplateRenderer } from '../src/renderer/templateRenderer.js';
import { SyncOrchestrator } from '../src/orchestrator/syncOrchestrator.js';

// Provide seamless API bridge for both Chrome Extension and Web Preview mode
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.runtime.sendMessage = function (msg, callback) {
    fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    })
      .then(res => res.json())
      .then(data => { if (callback) callback(data); })
      .catch(err => { if (callback) callback({ success: false, error: err.message }); });
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const pageDesc = document.getElementById('page-desc');

  // Dashboard elements
  const dashGhStatus = document.getElementById('dash-gh-status');
  const dashRepoName = document.getElementById('dash-repo-name');
  const dashRootFolder = document.getElementById('dash-root-folder');
  const dashPlatformsList = document.getElementById('dash-platforms-list');
  const dashStatAccepted = document.getElementById('dash-stat-accepted');
  const dashStatUploaded = document.getElementById('dash-stat-uploaded');
  const dashStatPending = document.getElementById('dash-stat-pending');
  const dashStatFailed = document.getElementById('dash-stat-failed');
  const dashActivityList = document.getElementById('dash-activity-list');
  const btnDashSyncPending = document.getElementById('btn-dash-sync-pending');

  // GitHub elements
  const ghPat = document.getElementById('gh-pat');
  const btnTogglePat = document.getElementById('btn-toggle-pat');
  const btnVerifyGh = document.getElementById('btn-verify-gh');
  const ghUserCard = document.getElementById('gh-user-card');
  const ghUserAvatar = document.getElementById('gh-user-avatar');
  const ghUserName = document.getElementById('gh-user-name');
  const ghUserUrl = document.getElementById('gh-user-url');
  const btnDisconnectGh = document.getElementById('btn-disconnect-gh');
  const ghRepoSelect = document.getElementById('gh-repo-select');
  const btnRefreshRepos = document.getElementById('btn-refresh-repos');
  const ghBranchSelect = document.getElementById('gh-branch-select');
  const ghRootFolder = document.getElementById('gh-root-folder');
  const ghFileFormat = document.getElementById('gh-file-format');
  const ghIncludeTopic = document.getElementById('gh-include-topic');

  // Platform Custom Paths inputs (Tab 3)
  const pathInputs = {
    leetcode: document.getElementById('path-leetcode'),
    geeksforgeeks: document.getElementById('path-geeksforgeeks'),
    codeforces: document.getElementById('path-codeforces'),
    codechef: document.getElementById('path-codechef'),
    hackerrank: document.getElementById('path-hackerrank'),
    hackerearth: document.getElementById('path-hackerearth')
  };

  const previewElements = {
    leetcode: document.getElementById('preview-leetcode'),
    geeksforgeeks: document.getElementById('preview-geeksforgeeks'),
    codeforces: document.getElementById('preview-codeforces'),
    codechef: document.getElementById('preview-codechef'),
    hackerrank: document.getElementById('preview-hackerrank'),
    hackerearth: document.getElementById('preview-hackerearth')
  };

  // Dashboard Platform Path Elements (Section 6 & User Request)
  const btnDashConnectGh = document.getElementById('btn-dash-connect-gh');
  const sidebarUserChip = document.getElementById('sidebar-user-chip');

  const dashRootFolderInput = document.getElementById('dash-root-folder-input');
  const btnApplyRootFolder = document.getElementById('btn-apply-root-folder');
  const btnDashRestorePaths = document.getElementById('btn-dash-restore-paths');
  const btnDashSavePaths = document.getElementById('btn-dash-save-paths');

  const dashPathInputs = {
    leetcode: document.getElementById('dash-path-leetcode'),
    geeksforgeeks: document.getElementById('dash-path-geeksforgeeks'),
    codeforces: document.getElementById('dash-path-codeforces'),
    codechef: document.getElementById('dash-path-codechef'),
    hackerrank: document.getElementById('dash-path-hackerrank'),
    hackerearth: document.getElementById('dash-path-hackerearth')
  };

  const dashPreviewElements = {
    leetcode: document.getElementById('dash-preview-leetcode'),
    geeksforgeeks: document.getElementById('dash-preview-geeksforgeeks'),
    codeforces: document.getElementById('dash-preview-codeforces'),
    codechef: document.getElementById('dash-preview-codechef'),
    hackerrank: document.getElementById('dash-preview-hackerrank'),
    hackerearth: document.getElementById('dash-preview-hackerearth')
  };

  // GitHub Modal Elements
  const ghLoginModal = document.getElementById('gh-login-modal');
  const btnCloseGhModal = document.getElementById('btn-close-gh-modal');
  const btnCancelGhModal = document.getElementById('btn-cancel-gh-modal');
  const modalGhPat = document.getElementById('modal-gh-pat');
  const btnToggleModalPat = document.getElementById('btn-toggle-modal-pat');
  const btnVerifyModalGh = document.getElementById('btn-verify-modal-gh');
  const modalGhUserCard = document.getElementById('modal-gh-user-card');
  const modalGhUserAvatar = document.getElementById('modal-gh-user-avatar');
  const modalGhUserName = document.getElementById('modal-gh-user-name');
  const modalGhUserUrl = document.getElementById('modal-gh-user-url');
  const modalRepoSection = document.getElementById('modal-repo-section');
  const modalGhRepoSelect = document.getElementById('modal-gh-repo-select');
  const btnModalCreateDsaRepo = document.getElementById('btn-modal-create-dsa-repo');
  const btnSaveGhModal = document.getElementById('btn-save-gh-modal');

  const btnRestorePaths = document.getElementById('btn-restore-paths');
  const pathValidationMsg = document.getElementById('path-validation-msg');

  // Create Repo elements
  const newRepoName = document.getElementById('new-repo-name');
  const newRepoPrivacy = document.getElementById('new-repo-privacy');
  const btnCreateRepo = document.getElementById('btn-create-repo');

  // AI Elements
  const aiProvider = document.getElementById('ai-provider');
  const aiModel = document.getElementById('ai-model');
  const aiApiKey = document.getElementById('ai-api-key');
  const aiKeyCountBadge = document.getElementById('ai-key-count-badge');
  const btnToggleAiKey = document.getElementById('btn-toggle-ai-key');
  const btnTestAi = document.getElementById('btn-test-ai');
  const customEndpointGroup = document.getElementById('custom-endpoint-group');
  const aiCustomEndpoint = document.getElementById('ai-custom-endpoint');
  const aiTemperature = document.getElementById('ai-temperature');
  const tempVal = document.getElementById('temp-val');
  const aiKeyHint = document.getElementById('ai-key-hint');
  const aiTestPreview = document.getElementById('ai-test-preview');
  const aiPreviewContent = document.getElementById('ai-preview-content');
  const btnCloseAiPreview = document.getElementById('btn-close-ai-preview');

  // Language checkboxes
  const langJava = document.getElementById('lang-java');
  const langPython = document.getElementById('lang-python');
  const langCpp = document.getElementById('lang-cpp');
  const langRust = document.getElementById('lang-rust');

  // Platform toggles
  const platformToggles = {
    leetcode: document.getElementById('platform-leetcode'),
    geeksforgeeks: document.getElementById('platform-geeksforgeeks'),
    codeforces: document.getElementById('platform-codeforces'),
    codechef: document.getElementById('platform-codechef'),
    hackerrank: document.getElementById('platform-hackerrank'),
    hackerearth: document.getElementById('platform-hackerearth')
  };

  // Template preview elements
  const templatePreviewCode = document.getElementById('template-preview-code');
  const btnCopyTemplate = document.getElementById('btn-copy-template');
  const btnDownloadTemplate = document.getElementById('btn-download-template');

  // History elements
  const historySearch = document.getElementById('history-search');
  const historyFilterPlatform = document.getElementById('history-filter-platform');
  const historyFilterStatus = document.getElementById('history-filter-status');
  const historyTableBody = document.getElementById('history-table-body');
  const btnRefreshHistory = document.getElementById('btn-refresh-history');
  const btnExportHistory = document.getElementById('btn-export-history');
  const btnClearHistory = document.getElementById('btn-clear-history');

  // Modal elements
  const fileModal = document.getElementById('file-modal');
  const modalFileTitle = document.getElementById('modal-file-title');
  const modalFileContent = document.getElementById('modal-file-content');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCloseModalFooter = document.getElementById('btn-close-modal-footer');
  const btnCopyModalFile = document.getElementById('btn-copy-modal-file');

  // Diagnostics elements
  const btnRunDiag = document.getElementById('btn-run-diag');
  const diagStatus = document.getElementById('diag-status');
  const diagLogContainer = document.getElementById('diag-log-container');
  const diagLogContent = document.getElementById('diag-log-content');

  // Save All button
  const btnSaveAll = document.getElementById('btn-save-all');

  // Global state
  let currentSettings = null;
  let allHistory = [];
  let activePreviewFormat = 'md';

  // Initialize
  await loadSettings();
  await loadHistory();
  renderDashboard();
  renderTemplatePreview();

  // --- TAB NAVIGATION ---
  const tabMetadata = {
    'tab-dashboard': { title: 'Dashboard Overview', desc: 'Real-time status of your DSA auto-sync operations and GitHub portfolio.' },
    'tab-onboarding': { title: 'First-Time Setup Wizard', desc: 'Step-by-step setup to connect GitHub, configure folders, and enable auto-sync.' },
    'tab-github': { title: 'GitHub & Folder Paths', desc: 'Manage your repository, root DSA directory, and platform-specific destinations.' },
    'tab-ai': { title: 'AI Engine & Models', desc: 'Configure AI model, API keys, temperature, and target languages.' },
    'tab-platforms': { title: 'Supported Platforms', desc: 'Enable or disable submission detection for each platform.' },
    'tab-template': { title: 'Template & File Preview', desc: 'Inspect the standard generated problem document format.' },
    'tab-history': { title: 'Sync History & Audit Log', desc: 'View complete log of documented DSA submissions.' },
    'tab-diagnostics': { title: 'Diagnostics & Simulation', desc: 'Verify the entire pipeline with a simulated submission.' }
  };

  function switchTab(tabId) {
    navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });

    tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabMetadata[tabId]) {
      pageTitle.textContent = tabMetadata[tabId].title;
      pageDesc.textContent = tabMetadata[tabId].desc;
    }

    if (tabId === 'tab-dashboard') {
      renderDashboard();
    } else if (tabId === 'tab-onboarding') {
      updateWizardProgress();
    } else if (tabId === 'tab-history') {
      loadHistory();
    } else if (tabId === 'tab-template') {
      renderTemplatePreview();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'));
    });
  });

  document.querySelectorAll('[data-switch-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.getAttribute('data-switch-tab');
      switchTab(targetTab);
    });
  });

  // --- SETTINGS LOADING & POPULATION ---
  async function loadSettings() {
    currentSettings = await StorageManager.getSettings();

    // Populate GitHub fields
    ghPat.value = currentSettings.github.pat || '';
    ghRootFolder.value = currentSettings.github.rootFolder || 'DSA';
    ghFileFormat.value = currentSettings.github.fileFormat || 'md';
    ghIncludeTopic.checked = Boolean(currentSettings.github.includeTopicSubfolder);

    // Populate Custom Platform Paths
    const root = currentSettings.github.rootFolder || 'DSA';
    const savedPaths = currentSettings.github.platformPaths || getDefaultPlatformPaths(root);

    if (dashRootFolderInput) {
      dashRootFolderInput.value = root;
    }

    for (const [pKey, inputEl] of Object.entries(pathInputs)) {
      if (inputEl) {
        inputEl.value = savedPaths[pKey] || `${root}/${SUPPORTED_PLATFORMS[pKey.toUpperCase()]?.defaultSubfolder || pKey}`;
      }
    }

    for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
      if (inputEl) {
        inputEl.value = savedPaths[pKey] || `${root}/${SUPPORTED_PLATFORMS[pKey.toUpperCase()]?.defaultSubfolder || pKey}`;
      }
    }

    if (currentSettings.github.pat) {
      verifyGitHubAuth(false);
    }

    // Populate AI fields
    aiProvider.value = currentSettings.ai.provider || AI_PROVIDERS.GEMINI;
    updateAiModelOptions(aiProvider.value);
    let selectedModel = currentSettings.ai.model || 'gemini-3.8-flash';
    if (selectedModel.startsWith('gemini-1.') || selectedModel.startsWith('gemini-2.')) {
      selectedModel = 'gemini-3.8-flash';
    }
    aiModel.value = selectedModel;

    const existingKeys = Array.isArray(currentSettings.ai.apiKeys) && currentSettings.ai.apiKeys.length > 0
      ? currentSettings.ai.apiKeys
      : (currentSettings.ai.apiKey ? [currentSettings.ai.apiKey] : []);
    aiApiKey.value = existingKeys.join('\n');
    updateAiKeyBadge();

    aiCustomEndpoint.value = currentSettings.ai.customEndpoint || 'http://localhost:11434/v1';
    aiTemperature.value = currentSettings.ai.temperature ?? 0.2;
    tempVal.textContent = aiTemperature.value;

    const langs = currentSettings.ai.languages || ['java', 'python', 'cpp', 'rust'];
    langJava.checked = langs.includes('java');
    langPython.checked = langs.includes('python');
    langCpp.checked = langs.includes('cpp');
    langRust.checked = langs.includes('rust');

    updateProviderHints(aiProvider.value);

    // Populate Platforms
    for (const [key, toggleEl] of Object.entries(platformToggles)) {
      if (toggleEl) {
        toggleEl.checked = currentSettings.platforms[key] !== false;
      }
    }

    updatePlatformPathPreviews();
  }

  // --- DASHBOARD RENDERER (Section 4.2 Spec) ---
  function renderDashboard() {
    if (!currentSettings) return;

    // GitHub Connection Status
    const isConnected = Boolean(currentSettings.github.pat && currentSettings.github.repoName);
    dashGhStatus.textContent = isConnected ? 'Connected ✓' : 'Not Connected';
    dashGhStatus.className = `badge-status ${isConnected ? 'connected' : 'disconnected'}`;
    dashRepoName.textContent = currentSettings.github.repoName ? `${currentSettings.github.username || 'user'}/${currentSettings.github.repoName}` : 'Not Configured';
    dashRootFolder.textContent = currentSettings.github.rootFolder || 'DSA';
    if (dashRootFolderInput) {
      dashRootFolderInput.value = currentSettings.github.rootFolder || 'DSA';
    }
    if (btnDashConnectGh) {
      btnDashConnectGh.textContent = isConnected ? '⚙️ Manage GitHub Connection' : '🔑 Login / Connect GitHub';
    }

    // Enabled Platforms Checklist
    dashPlatformsList.innerHTML = Object.entries(SUPPORTED_PLATFORMS).map(([key, p]) => {
      const isEnabled = currentSettings.platforms[p.id] !== false;
      return `
        <div class="check-item ${isEnabled ? 'enabled' : 'disabled'}">
          <span>${isEnabled ? '✓' : '✗'}</span>
          <span>${p.name}</span>
        </div>
      `;
    }).join('');

    // Statistics
    const acceptedCount = allHistory.length;
    const uploadedCount = allHistory.filter(h => h.status === 'SUCCESS').length;
    const pendingCount = allHistory.filter(h => ['PENDING', 'GENERATING', 'UPLOADING'].includes(h.status)).length;
    const failedCount = allHistory.filter(h => h.status === 'FAILED').length;

    dashStatAccepted.textContent = acceptedCount;
    dashStatUploaded.textContent = uploadedCount;
    dashStatPending.textContent = pendingCount;
    dashStatFailed.textContent = failedCount;

    // Recent Activity List
    if (allHistory.length === 0) {
      dashActivityList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 24px;">
          No submissions synced yet. Solve a problem on LeetCode or GFG to auto-sync!
        </div>
      `;
    } else {
      dashActivityList.innerHTML = allHistory.slice(0, 6).map(item => {
        const platformClass = `platform-${(item.platform || 'leetcode').toLowerCase()}`;
        const timeAgo = formatTimeAgo(item.timestamp);
        const statusHtml = item.status === 'SUCCESS' 
          ? `<a href="${item.commitUrl || '#'}" target="_blank" class="status-indicator-tag active">Uploaded ↗</a>`
          : (item.status === 'FAILED'
            ? `<span class="status-indicator-tag" style="background: rgba(239, 68, 68, 0.15); color: #F87171;">Failed</span>`
            : `<span class="status-indicator-tag" style="background: rgba(245, 158, 11, 0.15); color: #FBBF24;">${item.status}</span>`);

        return `
          <div class="activity-item">
            <div class="activity-left">
              <span class="platform-pill ${platformClass}">${item.platform || 'Code'}</span>
              <div class="activity-details">
                <span class="activity-title">${item.problemTitle || 'Untitled Problem'}</span>
                <span class="activity-path">${item.filePath || 'Processing...'} • ${timeAgo}</span>
              </div>
            </div>
            <div class="activity-right">
              ${statusHtml}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  btnDashSyncPending?.addEventListener('click', () => {
    const failedOrPending = allHistory.find(h => h.status === 'FAILED' || h.status === 'PENDING');
    if (failedOrPending) {
      showToast(`Retrying task for "${failedOrPending.problemTitle}"...`, 'success');
      chrome.runtime.sendMessage({ type: 'RETRY_SYNC', payload: { syncId: failedOrPending.id } }, async () => {
        await loadHistory();
        renderDashboard();
      });
    } else {
      showToast('All tasks are up to date! Triggering test simulation...', 'success');
      switchTab('tab-diagnostics');
    }
  });

  // --- PLATFORM PATH PREVIEWS & VALIDATION (Section 6.2 Spec) ---
  function updatePlatformPathPreviews() {
    const root = (dashRootFolderInput?.value || ghRootFolder?.value || 'DSA').trim().replace(/^\/+|\/+$/g, '');
    const format = ghFileFormat?.value || 'md';
    const sampleProblems = {
      leetcode: 'Two Sum',
      geeksforgeeks: 'Binary Search',
      codeforces: 'Watermelon',
      codechef: 'Chef and Strings',
      hackerrank: 'Array Manipulation',
      hackerearth: 'Monk and Inversions'
    };

    let hasInvalid = false;
    let warningText = '';

    for (const [pKey, inputEl] of Object.entries(pathInputs)) {
      if (inputEl) {
        const rawVal = inputEl.value.trim();
        // Validation check for illegal characters & traversal
        if (rawVal.includes('..')) {
          hasInvalid = true;
          warningText = 'Directory traversal (..) is not allowed in platform paths.';
        } else if (/[\\:*?"<>|]/.test(rawVal)) {
          hasInvalid = true;
          warningText = 'Platform paths cannot contain illegal characters: \\ : * ? " < > |';
        }

        const cleanVal = SyncOrchestrator.sanitizePath(rawVal);
        const sampleTitle = sampleProblems[pKey] || 'Problem';
        let previewPath = '';

        if (ghIncludeTopic?.checked) {
          previewPath = `${cleanVal}/Algorithms/${sampleTitle}.${format}`;
        } else {
          previewPath = `${cleanVal}/${sampleTitle}.${format}`;
        }

        if (previewElements[pKey]) {
          previewElements[pKey].textContent = previewPath;
        }
        if (dashPreviewElements[pKey]) {
          dashPreviewElements[pKey].textContent = previewPath;
        }
      }
    }

    if (hasInvalid) {
      if (pathValidationMsg) {
        pathValidationMsg.textContent = `⚠️ Validation Error: ${warningText}`;
        pathValidationMsg.classList.remove('hidden');
      }
    } else {
      if (pathValidationMsg) {
        pathValidationMsg.classList.add('hidden');
      }
    }
  }

  // Restore Defaults Button (GitHub Tab)
  btnRestorePaths?.addEventListener('click', () => {
    const root = ghRootFolder.value.trim() || 'DSA';
    const defaultPaths = getDefaultPlatformPaths(root);

    for (const [pKey, inputEl] of Object.entries(pathInputs)) {
      if (inputEl && defaultPaths[pKey]) {
        inputEl.value = defaultPaths[pKey];
      }
      if (dashPathInputs[pKey] && defaultPaths[pKey]) {
        dashPathInputs[pKey].value = defaultPaths[pKey];
      }
    }

    updatePlatformPathPreviews();
    showToast('Platform paths restored to defaults based on Root Folder!', 'success');
  });

  // Attach live input listeners to path inputs (GitHub Tab & Dashboard Tab in sync)
  for (const [pKey, inputEl] of Object.entries(pathInputs)) {
    inputEl?.addEventListener('input', () => {
      if (dashPathInputs[pKey]) {
        dashPathInputs[pKey].value = inputEl.value;
      }
      updatePlatformPathPreviews();
    });
  }

  for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
    inputEl?.addEventListener('input', () => {
      if (pathInputs[pKey]) {
        pathInputs[pKey].value = inputEl.value;
      }
      updatePlatformPathPreviews();
    });
  }

  ghRootFolder?.addEventListener('input', () => {
    if (dashRootFolderInput) dashRootFolderInput.value = ghRootFolder.value;
    updatePlatformPathPreviews();
  });

  dashRootFolderInput?.addEventListener('input', () => {
    if (ghRootFolder) ghRootFolder.value = dashRootFolderInput.value;
    updatePlatformPathPreviews();
  });

  ghFileFormat?.addEventListener('change', () => {
    updatePlatformPathPreviews();
    renderTemplatePreview();
  });
  ghIncludeTopic?.addEventListener('change', updatePlatformPathPreviews);

  // Apply Root Folder button on Dashboard
  btnApplyRootFolder?.addEventListener('click', async () => {
    const newRoot = (dashRootFolderInput.value.trim().replace(/^\/+|\/+$/g, '')) || 'DSA';
    dashRootFolderInput.value = newRoot;
    ghRootFolder.value = newRoot;
    dashRootFolder.textContent = newRoot;
    const defaultPaths = getDefaultPlatformPaths(newRoot);

    for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
      if (inputEl && defaultPaths[pKey]) {
        inputEl.value = defaultPaths[pKey];
      }
      if (pathInputs[pKey] && defaultPaths[pKey]) {
        pathInputs[pKey].value = defaultPaths[pKey];
      }
    }
    updatePlatformPathPreviews();

    // Auto-save the new paths
    const platformPaths = {};
    for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
      if (inputEl) {
        platformPaths[pKey] = SyncOrchestrator.sanitizePath(inputEl.value.trim());
      }
    }
    await StorageManager.updateSettings({
      github: {
        rootFolder: newRoot,
        platformPaths
      }
    });
    currentSettings = await StorageManager.getSettings();
    showToast(`DSA Root folder updated to "${newRoot}" and applied to all platforms!`, 'success');
  });

  // Save Platform Paths from Dashboard
  btnDashSavePaths?.addEventListener('click', async () => {
    const platformPaths = {};
    for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
      if (inputEl) {
        platformPaths[pKey] = SyncOrchestrator.sanitizePath(inputEl.value.trim());
      }
    }
    const root = (dashRootFolderInput?.value.trim().replace(/^\/+|\/+$/g, '')) || 'DSA';
    await StorageManager.updateSettings({
      github: {
        rootFolder: root,
        platformPaths
      }
    });
    currentSettings = await StorageManager.getSettings();
    dashRootFolder.textContent = root;
    showToast('Platform destination paths saved successfully! ✓', 'success');
  });

  // Restore Platform Paths from Dashboard
  btnDashRestorePaths?.addEventListener('click', async () => {
    const root = (dashRootFolderInput?.value.trim().replace(/^\/+|\/+$/g, '')) || 'DSA';
    const defaultPaths = getDefaultPlatformPaths(root);
    for (const [pKey, inputEl] of Object.entries(dashPathInputs)) {
      if (inputEl && defaultPaths[pKey]) {
        inputEl.value = defaultPaths[pKey];
      }
      if (pathInputs[pKey] && defaultPaths[pKey]) {
        pathInputs[pKey].value = defaultPaths[pKey];
      }
    }
    updatePlatformPathPreviews();
    await StorageManager.updateSettings({
      github: {
        rootFolder: root,
        platformPaths: defaultPaths
      }
    });
    currentSettings = await StorageManager.getSettings();
    showToast('Platform paths restored to defaults based on Root Folder!', 'success');
  });

  // --- AI PROVIDER CHANGE HANDLER ---
  function updateAiModelOptions(provider) {
    aiModel.innerHTML = '';
    const models = AI_MODELS[provider] || [];
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      aiModel.appendChild(opt);
    });

    if (provider === AI_PROVIDERS.CUSTOM) {
      customEndpointGroup.classList.remove('hidden');
    } else {
      customEndpointGroup.classList.add('hidden');
    }
  }

  function updateProviderHints(provider) {
    if (provider === AI_PROVIDERS.GEMINI) {
      aiKeyHint.innerHTML = 'Get a free Gemini API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" class="link">Google AI Studio</a>. Keys are stored locally on your device.';
    } else if (provider === AI_PROVIDERS.OPENAI) {
      aiKeyHint.innerHTML = 'Get an OpenAI API key at <a href="https://platform.openai.com/api-keys" target="_blank" class="link">OpenAI Platform</a>.';
    } else if (provider === AI_PROVIDERS.GROQ) {
      aiKeyHint.innerHTML = 'Get an ultra-fast free API key at <a href="https://console.groq.com/keys" target="_blank" class="link">Groq Cloud</a>.';
    } else {
      aiKeyHint.innerHTML = 'Use any OpenAI-compatible API endpoint (e.g., local Ollama, LM Studio, or custom proxy).';
    }
  }

  aiProvider.addEventListener('change', () => {
    updateAiModelOptions(aiProvider.value);
    updateProviderHints(aiProvider.value);
  });

  aiTemperature.addEventListener('input', () => {
    tempVal.textContent = aiTemperature.value;
  });

  // Toggle Visibility for sensitive inputs
  btnTogglePat.addEventListener('click', () => {
    const isPass = ghPat.type === 'password';
    ghPat.type = isPass ? 'text' : 'password';
    btnTogglePat.textContent = isPass ? 'Hide' : 'Show';
  });

  function updateAiKeyBadge() {
    if (!aiKeyCountBadge || !aiApiKey) return;
    const keys = aiApiKey.value.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
    if (keys.length > 1) {
      aiKeyCountBadge.textContent = `${keys.length} Keys (Failover Active)`;
      aiKeyCountBadge.className = 'badge-status connected';
      aiKeyCountBadge.classList.remove('hidden');
    } else if (keys.length === 1) {
      aiKeyCountBadge.textContent = '1 Key Loaded';
      aiKeyCountBadge.className = 'badge-status connected';
      aiKeyCountBadge.classList.remove('hidden');
    } else {
      aiKeyCountBadge.classList.add('hidden');
    }
  }

  aiApiKey?.addEventListener('input', updateAiKeyBadge);

  btnToggleAiKey?.addEventListener('click', () => {
    const isMasked = aiApiKey.style.webkitTextSecurity !== 'none';
    aiApiKey.style.webkitTextSecurity = isMasked ? 'none' : 'disc';
    btnToggleAiKey.textContent = isMasked ? 'Hide' : 'Show';
  });

  // --- GITHUB INTEGRATION LOGIC ---
  async function verifyGitHubAuth(showToastFlag = true) {
    const pat = ghPat.value.trim();
    if (!pat) {
      if (showToastFlag) showToast('Please enter a GitHub Personal Access Token.', 'error');
      return;
    }

    btnVerifyGh.disabled = true;
    btnVerifyGh.textContent = 'Verifying...';

    chrome.runtime.sendMessage({ type: 'TEST_GITHUB_CONNECTION', payload: { pat } }, async (res) => {
      btnVerifyGh.disabled = false;
      btnVerifyGh.textContent = 'Verify & Connect';

      if (res && res.success) {
        const { user } = res;
        ghUserAvatar.src = user.avatarUrl;
        ghUserName.textContent = user.name;
        ghUserUrl.textContent = `@${user.username}`;
        ghUserUrl.href = user.htmlUrl;
        ghUserCard.classList.remove('hidden');

        // Update sidebar & dashboard profile
        document.getElementById('sidebar-username').textContent = user.username;
        document.getElementById('sidebar-status').textContent = 'Connected ✓';
        document.getElementById('sidebar-avatar').textContent = user.username.charAt(0).toUpperCase();

        if (showToastFlag) showToast(`Connected to GitHub as ${user.username}!`, 'success');

        // Fetch repositories
        await fetchRepositories(pat);
        renderDashboard();
      } else {
        ghUserCard.classList.add('hidden');
        if (showToastFlag) showToast(`GitHub Auth Failed: ${res?.error || 'Invalid token'}`, 'error');
      }
    });
  }

  btnVerifyGh.addEventListener('click', () => verifyGitHubAuth(true));

  async function fetchRepositories(pat) {
    chrome.runtime.sendMessage({ type: 'FETCH_GITHUB_REPOS', payload: { pat } }, (res) => {
      if (res && res.success && res.repos) {
        ghRepoSelect.innerHTML = '';
        res.repos.forEach(repo => {
          const opt = document.createElement('option');
          opt.value = repo.name;
          opt.textContent = `${repo.owner}/${repo.name} ${repo.private ? '(Private)' : ''}`;
          if (repo.name === currentSettings.github.repoName) {
            opt.selected = true;
          }
          ghRepoSelect.appendChild(opt);
        });

        if (ghRepoSelect.value) {
          fetchBranches(pat, ghRepoSelect.value);
        }
      }
    });
  }

  btnRefreshRepos.addEventListener('click', () => {
    if (ghPat.value.trim()) {
      fetchRepositories(ghPat.value.trim());
      showToast('Refreshing repositories...', 'success');
    }
  });

  async function fetchBranches(pat, repoName) {
    const owner = currentSettings.github.username || document.getElementById('sidebar-username').textContent;
    chrome.runtime.sendMessage({
      type: 'FETCH_GITHUB_BRANCHES',
      payload: { pat, owner, repo: repoName }
    }, (res) => {
      if (res && res.success && res.branches) {
        ghBranchSelect.innerHTML = '';
        res.branches.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b;
          if (b === currentSettings.github.branch || b === 'main') {
            opt.selected = true;
          }
          ghBranchSelect.appendChild(opt);
        });
      }
    });
  }

  ghRepoSelect.addEventListener('change', () => {
    if (ghPat.value.trim() && ghRepoSelect.value) {
      fetchBranches(ghPat.value.trim(), ghRepoSelect.value);
      renderDashboard();
    }
  });

  // Create Repository Handler
  btnCreateRepo.addEventListener('click', () => {
    const name = newRepoName.value.trim();
    const isPrivate = newRepoPrivacy.value === 'true';
    const pat = ghPat.value.trim();

    if (!pat) {
      showToast('Connect your GitHub token first.', 'error');
      return;
    }
    if (!name) {
      showToast('Please provide a repository name.', 'error');
      return;
    }

    btnCreateRepo.disabled = true;
    btnCreateRepo.textContent = 'Creating...';

    chrome.runtime.sendMessage({
      type: 'CREATE_GITHUB_REPO',
      payload: {
        pat,
        name,
        description: 'Data Structures & Algorithms portfolio auto-synced with AlgoSync AI',
        isPrivate
      }
    }, (res) => {
      btnCreateRepo.disabled = false;
      btnCreateRepo.textContent = 'Create & Select';

      if (res && res.success) {
        showToast(`Repository "${name}" created successfully!`, 'success');
        fetchRepositories(pat);
      } else {
        showToast(`Failed to create repository: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  });

  // Disconnect GitHub
  btnDisconnectGh.addEventListener('click', async () => {
    ghPat.value = '';
    ghUserCard.classList.add('hidden');
    ghRepoSelect.innerHTML = '<option value="">-- Connect GitHub to load repositories --</option>';
    document.getElementById('sidebar-username').textContent = 'Not Connected';
    document.getElementById('sidebar-status').textContent = 'Setup Required';
    await saveAllSettings();
    showToast('GitHub disconnected.', 'success');
  });

  // --- GITHUB LOGIN / CONNECTION MODAL HANDLERS ---
  function openGhModal() {
    modalGhPat.value = ghPat.value || currentSettings?.github?.pat || '';
    if (modalGhPat.value) {
      verifyModalGitHubAuth(false);
    }
    ghLoginModal.classList.remove('hidden');
  }

  function closeGhModal() {
    ghLoginModal.classList.add('hidden');
  }

  btnDashConnectGh?.addEventListener('click', openGhModal);
  sidebarUserChip?.addEventListener('click', openGhModal);
  btnCloseGhModal?.addEventListener('click', closeGhModal);
  btnCancelGhModal?.addEventListener('click', closeGhModal);
  ghLoginModal?.addEventListener('click', (e) => {
    if (e.target === ghLoginModal) closeGhModal();
  });

  btnToggleModalPat?.addEventListener('click', () => {
    const isPass = modalGhPat.type === 'password';
    modalGhPat.type = isPass ? 'text' : 'password';
    btnToggleModalPat.textContent = isPass ? 'Hide' : 'Show';
  });

  async function verifyModalGitHubAuth(showToastFlag = true) {
    const pat = modalGhPat.value.trim();
    if (!pat) {
      if (showToastFlag) showToast('Please enter a GitHub Personal Access Token.', 'error');
      return;
    }

    btnVerifyModalGh.disabled = true;
    btnVerifyModalGh.textContent = 'Verifying...';

    chrome.runtime.sendMessage({ type: 'TEST_GITHUB_CONNECTION', payload: { pat } }, async (res) => {
      btnVerifyModalGh.disabled = false;
      btnVerifyModalGh.textContent = 'Connect Account';

      if (res && res.success) {
        const { user } = res;
        modalGhUserAvatar.src = user.avatarUrl;
        modalGhUserName.textContent = user.name || user.username;
        modalGhUserUrl.textContent = `@${user.username}`;
        modalGhUserUrl.href = user.htmlUrl;
        modalGhUserCard.classList.remove('hidden');
        modalRepoSection.classList.remove('hidden');
        btnSaveGhModal.disabled = false;

        // Also update GitHub Tab & Sidebar profile
        ghPat.value = pat;
        ghUserAvatar.src = user.avatarUrl;
        ghUserName.textContent = user.name || user.username;
        ghUserUrl.textContent = `@${user.username}`;
        ghUserUrl.href = user.htmlUrl;
        ghUserCard.classList.remove('hidden');

        document.getElementById('sidebar-username').textContent = user.username;
        document.getElementById('sidebar-status').textContent = 'Connected ✓';
        document.getElementById('sidebar-avatar').textContent = user.username.charAt(0).toUpperCase();

        if (showToastFlag) showToast(`GitHub account @${user.username} verified!`, 'success');

        // Fetch repos into modal selector & GitHub Tab selector
        chrome.runtime.sendMessage({ type: 'FETCH_GITHUB_REPOS', payload: { pat } }, (repoRes) => {
          if (repoRes && repoRes.success && repoRes.repos) {
            modalGhRepoSelect.innerHTML = '';
            ghRepoSelect.innerHTML = '';
            repoRes.repos.forEach(repo => {
              const opt = document.createElement('option');
              opt.value = repo.name;
              opt.textContent = `${repo.owner}/${repo.name} ${repo.private ? '(Private)' : ''}`;
              if (repo.name === currentSettings.github.repoName || repo.name.toLowerCase() === 'dsa') {
                opt.selected = true;
              }
              modalGhRepoSelect.appendChild(opt);

              const opt2 = opt.cloneNode(true);
              ghRepoSelect.appendChild(opt2);
            });
          }
        });
      } else {
        modalGhUserCard.classList.add('hidden');
        modalRepoSection.classList.add('hidden');
        btnSaveGhModal.disabled = true;
        if (showToastFlag) showToast(`Authentication failed: ${res?.error || 'Invalid token'}`, 'error');
      }
    });
  }

  btnVerifyModalGh?.addEventListener('click', () => verifyModalGitHubAuth(true));

  btnModalCreateDsaRepo?.addEventListener('click', () => {
    const pat = modalGhPat.value.trim();
    if (!pat) {
      showToast('Connect and verify token first.', 'error');
      return;
    }
    btnModalCreateDsaRepo.disabled = true;
    btnModalCreateDsaRepo.textContent = 'Creating...';

    chrome.runtime.sendMessage({
      type: 'CREATE_GITHUB_REPO',
      payload: {
        pat,
        name: 'DSA',
        description: 'Data Structures & Algorithms portfolio auto-synced with AlgoSync AI',
        isPrivate: false
      }
    }, (res) => {
      btnModalCreateDsaRepo.disabled = false;
      btnModalCreateDsaRepo.textContent = '+ New "DSA" Repo';
      if (res && res.success) {
        showToast('Created "DSA" repository on your GitHub! ✓', 'success');
        verifyModalGitHubAuth(false);
      } else {
        showToast(`Could not create repo: ${res?.error || 'Already exists or forbidden'}`, 'error');
      }
    });
  });

  btnSaveGhModal?.addEventListener('click', async () => {
    const pat = modalGhPat.value.trim();
    const repo = modalGhRepoSelect.value;
    const username = document.getElementById('sidebar-username').textContent;

    if (!pat || !repo) {
      showToast('Please select a repository.', 'error');
      return;
    }

    await StorageManager.updateSettings({
      github: {
        pat,
        repoName: repo,
        username,
        isConnected: true
      }
    });
    currentSettings = await StorageManager.getSettings();
    renderDashboard();
    closeGhModal();
    showToast(`Connected to GitHub repo "${repo}"! Auto-sync is active. 🚀`, 'success');
  });

  // --- TEST AI CONNECTION ---
  btnTestAi.addEventListener('click', () => {
    const parsedKeys = aiApiKey.value.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
    const apiKey = parsedKeys[0] || '';
    const apiKeys = parsedKeys;
    const provider = aiProvider.value;
    const model = aiModel.value;
    const customEndpoint = aiCustomEndpoint.value.trim();
    const temperature = parseFloat(aiTemperature.value);

    if (apiKeys.length === 0 && provider !== 'custom') {
      showToast('Please enter at least one API Key to test.', 'error');
      return;
    }

    btnTestAi.disabled = true;
    btnTestAi.textContent = 'Analyzing...';
    aiTestPreview.classList.add('hidden');

    chrome.runtime.sendMessage({
      type: 'TEST_AI_CONNECTION',
      payload: {
        aiSettings: { provider, apiKey, apiKeys, model, customEndpoint, temperature }
      }
    }, (res) => {
      btnTestAi.disabled = false;
      btnTestAi.textContent = 'Test AI Connection';

      if (res && res.success) {
        showToast(`AI verified successfully! (${apiKeys.length} key${apiKeys.length > 1 ? 's' : ''} active) 🚀`, 'success');
        aiTestPreview.classList.remove('hidden');
        aiPreviewContent.textContent = JSON.stringify(res.sampleResult, null, 2);
      } else {
        showToast(`AI Test Failed: ${res?.error || 'Check API key & model'}`, 'error');
      }
    });
  });

  btnCloseAiPreview.addEventListener('click', () => {
    aiTestPreview.classList.add('hidden');
  });

  // --- SAVE ALL SETTINGS ---
  async function saveAllSettings() {
    const selectedLanguages = [];
    if (langJava.checked) selectedLanguages.push('java');
    if (langPython.checked) selectedLanguages.push('python');
    if (langCpp.checked) selectedLanguages.push('cpp');
    if (langRust.checked) selectedLanguages.push('rust');

    const parsedKeys = aiApiKey.value.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);

    const platformPaths = {};
    for (const pKey of Object.keys(pathInputs)) {
      const val = dashPathInputs[pKey]?.value || pathInputs[pKey]?.value || '';
      if (val) {
        platformPaths[pKey] = SyncOrchestrator.sanitizePath(val.trim());
      }
    }

    const effectiveRoot = (dashRootFolderInput?.value || ghRootFolder?.value || 'DSA').trim().replace(/^\/+|\/+$/g, '') || 'DSA';

    const updated = {
      github: {
        pat: ghPat.value.trim(),
        username: document.getElementById('sidebar-username').textContent,
        repoName: ghRepoSelect.value || currentSettings?.github?.repoName || 'DSA',
        branch: ghBranchSelect.value || currentSettings?.github?.branch || 'main',
        rootFolder: effectiveRoot,
        platformPaths: platformPaths,
        fileFormat: ghFileFormat.value || 'md',
        includeTopicSubfolder: ghIncludeTopic.checked,
        isConnected: Boolean(ghPat.value.trim() && (ghRepoSelect.value || currentSettings?.github?.repoName))
      },
      ai: {
        provider: aiProvider.value,
        apiKey: parsedKeys[0] || '',
        apiKeys: parsedKeys,
        model: aiModel.value,
        customEndpoint: aiCustomEndpoint.value.trim(),
        temperature: parseFloat(aiTemperature.value),
        languages: selectedLanguages
      },
      platforms: {
        leetcode: platformToggles.leetcode.checked,
        geeksforgeeks: platformToggles.geeksforgeeks.checked,
        codeforces: platformToggles.codeforces.checked,
        codechef: platformToggles.codechef.checked,
        hackerrank: platformToggles.hackerrank.checked,
        hackerearth: platformToggles.hackerearth.checked
      }
    };

    await StorageManager.updateSettings(updated);
    currentSettings = await StorageManager.getSettings();
    renderDashboard();
    showToast('Settings saved successfully! ✓', 'success');
  }

  btnSaveAll.addEventListener('click', saveAllSettings);

  function renderTemplatePreview(formatOverride = null) {
    const format = formatOverride || activePreviewFormat || ghFileFormat?.value || 'md';
    activePreviewFormat = format;

    const btnMd = document.getElementById('btn-preview-format-md');
    const btnTxt = document.getElementById('btn-preview-format-txt');
    if (btnMd && btnTxt) {
      btnMd.className = `btn btn-sm ${format === 'md' ? 'btn-primary' : 'btn-secondary'}`;
      btnTxt.className = `btn btn-sm ${format === 'txt' ? 'btn-primary' : 'btn-secondary'}`;
    }

    const sampleData = {
      problem: {
        title: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        platform: 'LeetCode',
        originalLanguage: 'Java',
        originalCode: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[] { map.get(complement), i };
            }
            map.put(nums[i], i);
        }
        return new int[0];
    }
}`,
        description: `Given an array of integers nums and an integer target, return indices of two numbers whose sum equals target.

Assume that exactly one valid answer exists and that the same element cannot be used twice.`
      },
      aiAnalysis: {
        algorithm: 'Hash Map',
        idea: 'Maintain a hash map containing the values encountered and their corresponding indices.\n\nFor every number, calculate its complement: complement = target - currentNumber.\nIf the complement exists in the map, the answer has been found.',
        steps: [
          'Calculate the complement required to reach the target (target - nums[i]).',
          'Check whether the complement exists in the hash map.',
          'If it exists, return the two indices.',
          'Otherwise, store the current number and its index.'
        ],
        whyItWorks: 'The hash map allows checking for previously seen values in O(1) average time.',
        timeComplexity: 'O(n) average time.',
        auxiliarySpaceComplexity: 'O(n).'
      },
      testCases: [
        {
          name: 'Standard Example',
          input: 'nums = [2, 7, 11, 15], target = 9',
          expectedOutput: '[0, 1]',
          explanation: 'nums[0] + nums[1] = 9.'
        },
        {
          name: 'Different Positions',
          input: 'nums = [3, 2, 4], target = 6',
          expectedOutput: '[1, 2]',
          explanation: 'nums[1] + nums[2] = 6.'
        },
        {
          name: 'Same Value Pairs',
          input: 'nums = [3, 3], target = 6',
          expectedOutput: '[0, 1]',
          explanation: 'nums[0] + nums[1] = 6.'
        }
      ],
      languages: {
        java: {
          whatIsRequired: ['Arrays', 'HashMap', 'Complement lookup'],
          importantConcepts: ['Arrays', 'HashMap', 'Complement lookup'],
          code: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[] { map.get(complement), i };
            }
            map.put(nums[i], i);
        }
        return new int[0];
    }
}`
        },
        python: {
          whatIsRequired: ['Lists', 'Dictionaries', 'Hash-based lookup'],
          importantConcepts: ['Lists', 'Dictionaries', 'Hash-based lookup'],
          code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return []`
        },
        cpp: {
          whatIsRequired: ['Vectors', 'Unordered maps', 'Hash-based lookup'],
          importantConcepts: ['Vectors', 'Unordered maps', 'Hash-based lookup'],
          code: `#include <vector>
#include <unordered_map>

class Solution {
public:
    std::vector<int> twoSum(std::vector<int>& nums, int target) {
        std::unordered_map<int, int> num_map;
        for (int i = 0; i < nums.size(); ++i) {
            int complement = target - nums[i];
            if (num_map.find(complement) != num_map.end()) {
                return {num_map[complement], i};
            }
            num_map[nums[i]] = i;
        }
        return {};
    }
};`
        },
        rust: {
          whatIsRequired: ['Vectors', 'HashMap', 'Ownership and borrowing'],
          importantConcepts: ['Vectors', 'HashMap', 'Ownership and borrowing'],
          code: `use std::collections::HashMap;

impl Solution {
    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {
        let mut map: HashMap<i32, i32> = HashMap::new();
        for (i, &num) in nums.iter().enumerate() {
            let complement = target - num;
            if let Some(&prev_idx) = map.get(&complement) {
                return vec![prev_idx, i as i32];
            }
            map.insert(num, i as i32);
        }
        vec![]
    }
}`
        }
      },
      motivation: 'Every problem you solve adds another tool to your problem-solving toolkit.'
    };

    const rendered = TemplateRenderer.render(sampleData, format);
    templatePreviewCode.textContent = rendered;
  }

  document.getElementById('btn-preview-format-md')?.addEventListener('click', () => {
    renderTemplatePreview('md');
  });

  document.getElementById('btn-preview-format-txt')?.addEventListener('click', () => {
    renderTemplatePreview('txt');
  });

  document.querySelectorAll('.btn-open-gh-modal').forEach(btn => {
    btn.addEventListener('click', openGhModal);
  });

  function updateWizardProgress() {
    let completedSteps = 0;
    if (currentSettings?.github?.pat) completedSteps++;
    if (currentSettings?.github?.repoName) completedSteps++;
    if (currentSettings?.github?.platformPaths) completedSteps++;
    if (currentSettings?.ai?.apiKey || currentSettings?.ai?.provider === 'custom') completedSteps++;
    if (allHistory?.length > 0) completedSteps++;

    const percent = Math.min(100, Math.round((completedSteps / 5) * 100));
    const fillEl = document.getElementById('wizard-progress-fill');
    const textEl = document.getElementById('wizard-progress-text');
    if (fillEl) fillEl.style.width = `${Math.max(20, percent)}%`;
    if (textEl) textEl.textContent = `${completedSteps} of 5 Steps Completed (${percent}%)`;
  }

  btnCopyTemplate.addEventListener('click', () => {
    navigator.clipboard.writeText(templatePreviewCode.textContent);
    showToast('Sample template copied to clipboard! ✓', 'success');
  });

  btnDownloadTemplate.addEventListener('click', () => {
    const format = activePreviewFormat || ghFileFormat?.value || 'md';
    const blob = new Blob([templatePreviewCode.textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Two Sum.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "Two Sum.${format}" sample!`, 'success');
  });

  // --- SYNC HISTORY MANAGEMENT ---
  async function loadHistory() {
    allHistory = await StorageManager.getHistory();
    renderHistoryTable();
  }

  function renderHistoryTable() {
    const search = historySearch.value.trim().toLowerCase();
    const platFilter = historyFilterPlatform.value;
    const statusFilter = historyFilterStatus.value;

    const filtered = allHistory.filter(item => {
      const matchSearch = !search || (item.problemTitle || '').toLowerCase().includes(search);
      const matchPlat = !platFilter || item.platform === platFilter;
      const matchStatus = !statusFilter || item.status === statusFilter;
      return matchSearch && matchPlat && matchStatus;
    });

    if (filtered.length === 0) {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 32px;">
            No synchronization records matching filters found.
          </td>
        </tr>
      `;
      return;
    }

    historyTableBody.innerHTML = filtered.map(item => {
      const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A';
      let statusChip = '';
      if (item.status === 'SUCCESS') {
        statusChip = '<span class="status-indicator-tag active">Success</span>';
      } else if (item.status === 'FAILED') {
        statusChip = `<span class="status-indicator-tag" style="background: rgba(239, 68, 68, 0.15); color: #F87171;">Failed</span>`;
      } else {
        statusChip = `<span class="status-indicator-tag" style="background: rgba(245, 158, 11, 0.15); color: #FBBF24;">${item.status}</span>`;
      }

      return `
        <tr>
          <td><strong>${item.platform || 'N/A'}</strong></td>
          <td>${item.problemTitle || 'Untitled'}</td>
          <td>${item.language || 'N/A'}</td>
          <td><code style="font-size: 11.5px; color: #94A3B8;">${item.filePath || 'N/A'}</code></td>
          <td>${statusChip}</td>
          <td style="color: var(--text-dim); font-size: 11px;">${dateStr}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              ${item.generatedContent ? `<button class="btn btn-sm btn-secondary btn-view-file" data-id="${item.id}">View</button>` : ''}
              ${item.commitUrl ? `<a href="${item.commitUrl}" target="_blank" class="btn btn-sm btn-outline">Commit ↗</a>` : ''}
              ${item.status === 'FAILED' ? `<button class="btn btn-sm btn-primary btn-retry-history" data-id="${item.id}">Retry ↻</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach View File Handlers
    document.querySelectorAll('.btn-view-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const item = allHistory.find(h => h.id === id);
        if (item && item.generatedContent) {
          modalFileTitle.textContent = `${item.problemTitle} (${item.platform})`;
          modalFileContent.textContent = item.generatedContent;
          fileModal.classList.remove('hidden');
        }
      });
    });

    // Attach Retry Handlers
    document.querySelectorAll('.btn-retry-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = 'Retrying...';
        chrome.runtime.sendMessage({ type: 'RETRY_SYNC', payload: { syncId: id } }, (res) => {
          if (res && res.success) {
            showToast('Retry successful! Synced to GitHub.', 'success');
          } else {
            showToast(`Retry failed: ${res?.error || 'Unknown error'}`, 'error');
          }
          loadHistory();
          renderDashboard();
        });
      });
    });
  }

  historySearch.addEventListener('input', renderHistoryTable);
  historyFilterPlatform.addEventListener('change', renderHistoryTable);
  historyFilterStatus.addEventListener('change', renderHistoryTable);

  btnRefreshHistory?.addEventListener('click', async () => {
    btnRefreshHistory.disabled = true;
    const origHtml = btnRefreshHistory.innerHTML;
    btnRefreshHistory.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
      Refreshing...
    `;
    try {
      await loadHistory();
      renderDashboard();
      showToast('Sync history refreshed! ✓', 'success');
    } catch (e) {
      showToast(`Failed to refresh history: ${e.message}`, 'error');
    } finally {
      setTimeout(() => {
        btnRefreshHistory.disabled = false;
        btnRefreshHistory.innerHTML = origHtml;
      }, 350);
    }
  });

  btnExportHistory.addEventListener('click', () => {
    const jsonStr = JSON.stringify(allHistory, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `algosync-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported history as JSON!', 'success');
  });

  btnClearHistory.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your local synchronization history?')) {
      await StorageManager.clearHistory();
      await loadHistory();
      renderDashboard();
      showToast('History cleared.', 'success');
    }
  });

  // Modal Handlers
  const closeModal = () => fileModal.classList.add('hidden');
  btnCloseModal.addEventListener('click', closeModal);
  btnCloseModalFooter.addEventListener('click', closeModal);
  fileModal.addEventListener('click', (e) => {
    if (e.target === fileModal) closeModal();
  });

  btnCopyModalFile.addEventListener('click', () => {
    navigator.clipboard.writeText(modalFileContent.textContent);
    showToast('Document content copied to clipboard! ✓', 'success');
  });

  // --- DIAGNOSTICS & SIMULATOR ---
  btnRunDiag.addEventListener('click', () => {
    btnRunDiag.disabled = true;
    diagStatus.textContent = 'Executing full pipeline...';
    diagLogContainer.classList.remove('hidden');
    diagLogContent.textContent = '[1/5] Simulating accepted submission for Two Sum...\n';

    chrome.runtime.sendMessage({ type: 'TRIGGER_TEST_SYNC' }, async (res) => {
      btnRunDiag.disabled = false;
      if (res && res.success) {
        diagStatus.textContent = 'Pipeline Completed Successfully! 🚀';
        diagLogContent.textContent += '[2/5] AI Multilingual Generation: Succeeded\n' +
          '[3/5] Format Generation: Succeeded\n' +
          `[4/5] Custom Path Resolution: Succeeded (${res.record?.filePath})\n` +
          `[5/5] GitHub Upload & Commit: Succeeded\nCommit URL: ${res.record?.commitUrl || 'Committed'}\n` +
          'All systems verified operational!';
        showToast('Diagnostic completed with 100% success! 🚀', 'success');
        await loadHistory();
        renderDashboard();
      } else {
        diagStatus.textContent = 'Pipeline Failed ⚠️';
        diagLogContent.textContent += `[ERROR] Pipeline halted: ${res?.error || 'Make sure GitHub and AI are configured'}\n` +
          'Check your settings in the GitHub and AI tabs.';
        showToast(`Diagnostic failed: ${res?.error || 'Check settings'}`, 'error');
      }
    });
  });

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const elapsed = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsed < 60) return 'Just now';
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
    if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
    return `${Math.floor(elapsed / 86400)}d ago`;
  }

  // Toast Helper
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '⚠️'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
});
