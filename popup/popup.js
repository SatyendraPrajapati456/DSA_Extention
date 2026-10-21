/**
 * AlgoSync Popup Logic
 */

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
  const btnOpenOptions = document.getElementById('btn-open-options');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnTriggerTest = document.getElementById('btn-trigger-test');
  const toggleAutoSync = document.getElementById('toggle-autosync');

  const statusCard = document.getElementById('status-card');
  const statusLabel = document.getElementById('status-label');
  const targetRepoBadge = document.getElementById('target-repo-badge');

  const statSynced = document.getElementById('stat-synced');
  const statRate = document.getElementById('stat-rate');
  const statProvider = document.getElementById('stat-provider');
  const recentList = document.getElementById('recent-syncs-list');

  // Navigation to options page
  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  };

  btnOpenOptions?.addEventListener('click', openOptions);
  btnOpenDashboard?.addEventListener('click', openOptions);
  statusCard?.addEventListener('click', openOptions);
  targetRepoBadge?.addEventListener('click', openOptions);

  // Refresh status & data
  async function loadData() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS_SUMMARY' }, (response) => {
      if (!response || !response.summary) return;
      const { summary } = response;

      // Update Stats
      statSynced.textContent = summary.successful || 0;
      const rate = summary.total > 0 ? Math.round((summary.successful / summary.total) * 100) : 100;
      statRate.textContent = `${rate}%`;
      statProvider.textContent = (summary.provider || 'gemini').toUpperCase();

      // Update Status Banner
      if (summary.isGitHubConnected && summary.isAiConnected) {
        statusCard.className = 'status-card active';
        statusLabel.textContent = 'Active & Auto-Sync Ready';
        targetRepoBadge.textContent = summary.repoName ? `${summary.repoName} / ${summary.rootFolder || 'DSA'}` : 'Configured';
      } else {
        statusCard.className = 'status-card warning';
        if (!summary.isGitHubConnected && !summary.isAiConnected) {
          statusLabel.textContent = 'GitHub & AI Setup Needed';
          targetRepoBadge.textContent = 'Setup Required';
        } else if (!summary.isGitHubConnected) {
          statusLabel.textContent = 'Connect GitHub Repository';
          targetRepoBadge.textContent = 'GitHub Needed';
        } else {
          statusLabel.textContent = 'Configure AI Model Key';
          targetRepoBadge.textContent = 'AI Key Needed';
        }
      }

      // Render Recent Submissions
      renderRecentList(summary.recentSyncs || []);
    });

    // Check AutoSync Toggle state from storage
    chrome.storage.local.get(['algosync_settings'], (result) => {
      const settings = result['algosync_settings'] || {};
      if (toggleAutoSync) {
        toggleAutoSync.checked = settings.syncPreferences?.autoSyncOnAccept !== false;
      }
    });
  }

  // Toggle Auto-sync handler
  toggleAutoSync?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    chrome.storage.local.get(['algosync_settings'], (result) => {
      const current = result['algosync_settings'] || {};
      const updated = {
        ...current,
        syncPreferences: {
          ...(current.syncPreferences || {}),
          autoSyncOnAccept: isChecked
        }
      };
      chrome.storage.local.set({ 'algosync_settings': updated });
    });
  });

  // Render recent sync cards
  function renderRecentList(items) {
    if (!items || items.length === 0) {
      recentList.innerHTML = `
        <div class="empty-state">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <p>No recent submissions yet.</p>
          <p class="sub-text">Solve a problem on LeetCode, GFG, or Codeforces!</p>
        </div>
      `;
      return;
    }

    recentList.innerHTML = items.map(item => {
      const platformClass = `platform-${(item.platform || 'leetcode').toLowerCase()}`;
      let statusHtml = '';

      if (item.status === 'SUCCESS') {
        const link = item.commitUrl || '#';
        statusHtml = `<a href="${link}" target="_blank" class="status-badge success" title="View commit on GitHub">Synced ↗</a>`;
      } else if (item.status === 'FAILED') {
        statusHtml = `<button class="status-badge failed btn-retry" data-id="${item.id}" title="${item.error || 'Click to retry'}">Retry ↻</button>`;
      } else {
        statusHtml = `<span class="status-badge ${item.status.toLowerCase()}">${item.status}</span>`;
      }

      const timeAgo = formatTimeAgo(item.timestamp);

      return `
        <div class="recent-item">
          <div class="item-left">
            <div class="item-title-row">
              <span class="platform-pill ${platformClass}">${item.platform || 'Code'}</span>
              <span class="item-title" title="${item.problemTitle}">${item.problemTitle || 'Untitled Problem'}</span>
            </div>
            <span class="item-meta">${item.language || ''} • ${timeAgo}</span>
          </div>
          <div class="item-right">
            ${statusHtml}
          </div>
        </div>
      `;
    }).join('');

    // Attach retry handlers
    document.querySelectorAll('.btn-retry').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const syncId = e.currentTarget.getAttribute('data-id');
        btn.textContent = 'Retrying...';
        btn.disabled = true;
        chrome.runtime.sendMessage({ type: 'RETRY_SYNC', payload: { syncId } }, () => {
          setTimeout(loadData, 1000);
        });
      });
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const elapsed = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsed < 60) return 'Just now';
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
    if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
    return `${Math.floor(elapsed / 86400)}d ago`;
  }

  // Trigger test pipeline
  btnTriggerTest?.addEventListener('click', () => {
    btnTriggerTest.disabled = true;
    btnTriggerTest.innerHTML = 'Testing...';

    chrome.runtime.sendMessage({ type: 'TRIGGER_TEST_SYNC' }, (res) => {
      btnTriggerTest.disabled = false;
      btnTriggerTest.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Test Pipeline
      `;

      if (res && res.success) {
        alert('Test Problem Successfully Processed & Uploaded to GitHub! 🚀\nCheck your repository or the recent list.');
      } else {
        alert(`Test Failed: ${res?.error || 'Make sure GitHub & AI settings are configured in Options.'}`);
      }
      loadData();
    });
  });

  btnRefresh?.addEventListener('click', loadData);

  // Initial load
  loadData();
});
