/**
 * AlgoSync Common Content Script Helper
 * Provides unified HUD badge, code extraction helpers, and background messaging.
 */

window.AlgoSyncCommon = {
  /**
   * Initializes a non-intrusive floating HUD widget on problem pages
   */
  initHUD(platformName) {
    if (document.getElementById('algosync-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'algosync-hud';
    hud.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 9999px;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(99, 102, 241, 0.2);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      user-select: none;
    `;

    hud.innerHTML = `
      <span id="algosync-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
      <span id="algosync-text">AlgoSync: Auto-sync Ready</span>
    `;

    hud.title = 'AlgoSync AI is actively monitoring for accepted submissions.';

    hud.addEventListener('click', () => {
      // Open popup or options
      chrome.runtime.sendMessage({ type: 'GET_STATUS_SUMMARY' }, (res) => {
        if (res && res.summary) {
          alert(`AlgoSync AI Active\n\nPlatform: ${platformName}\nGitHub Repo: ${res.summary.repoName}\nAI Provider: ${res.summary.provider}\nTotal Synced: ${res.summary.successful}/${res.summary.total}`);
        }
      });
    });

    document.body.appendChild(hud);
  },

  /**
   * Updates HUD status
   * @param {'ready'|'syncing'|'success'|'error'} state 
   * @param {string} message 
   */
  updateHUD(state, message) {
    const hud = document.getElementById('algosync-hud');
    const dot = document.getElementById('algosync-dot');
    const text = document.getElementById('algosync-text');
    if (!hud || !dot || !text) return;

    if (state === 'syncing') {
      dot.style.background = '#F59E0B';
      text.innerText = message || 'AlgoSync: Generating & Syncing...';
      hud.style.borderColor = 'rgba(245, 158, 11, 0.5)';
    } else if (state === 'success') {
      dot.style.background = '#10B981';
      text.innerText = message || 'AlgoSync: Synced to GitHub! ✓';
      hud.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      setTimeout(() => {
        this.updateHUD('ready', 'AlgoSync: Auto-sync Ready');
      }, 5000);
    } else if (state === 'error') {
      dot.style.background = '#EF4444';
      text.innerText = message || 'AlgoSync: Sync Failed';
      hud.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      setTimeout(() => {
        this.updateHUD('ready', 'AlgoSync: Auto-sync Ready');
      }, 6000);
    } else {
      dot.style.background = '#10B981';
      text.innerText = message || 'AlgoSync: Auto-sync Ready';
      hud.style.borderColor = 'rgba(99, 102, 241, 0.35)';
    }
  },

  /**
   * Sends accepted submission payload to service worker
   */
  notifyAcceptedSubmission(submission) {
    console.log('[AlgoSync] Notifying background of accepted submission:', submission.title);
    this.updateHUD('syncing', 'AlgoSync: Generating AI Solution & Syncing...');

    chrome.runtime.sendMessage({
      type: 'SUBMISSION_ACCEPTED',
      payload: submission
    }, (response) => {
      if (response && response.success) {
        this.updateHUD('success', 'AlgoSync: Synced to GitHub! 🚀');
      } else {
        const errMsg = response?.error || 'Sync failed';
        console.error('[AlgoSync] Background sync error:', errMsg);
        this.updateHUD('error', `AlgoSync: ${errMsg.substring(0, 30)}...`);
      }
    });
  },

  /**
   * Safely extracts text from an element matching selectors
   */
  getText(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        return el.innerText.trim();
      }
    }
    return '';
  },

  /**
   * Cleans HTML markup into readable plain text for problem descriptions
   */
  cleanHtmlToText(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Replace breaks and paragraphs with newlines
    temp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    temp.querySelectorAll('p').forEach(p => p.after('\n\n'));
    temp.querySelectorAll('li').forEach(li => li.before('• '));

    return (temp.textContent || temp.innerText || '').trim();
  }
};
