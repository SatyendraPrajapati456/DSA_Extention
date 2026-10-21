/**
 * AlgoSync Background Service Worker (Manifest V3)
 * Orchestrates messages between content scripts, options page, popup, and external APIs.
 */

import { SyncOrchestrator } from '../src/orchestrator/syncOrchestrator.js';
import { StorageManager } from '../src/storage/storageManager.js';
import { GitHubClient } from '../src/github/githubClient.js';
import { AIService } from '../src/ai/aiService.js';

// Setup default configuration on extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AlgoSync Service Worker] Installed:', details.reason);
  const currentSettings = await StorageManager.getSettings();
  await StorageManager.updateSettings(currentSettings); // ensures all default fields exist
});

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return true to indicate asynchronous response
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[AlgoSync Service Worker] Error handling message:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case 'SUBMISSION_ACCEPTED': {
      console.log('[AlgoSync] Received SUBMISSION_ACCEPTED event:', payload.title, 'on', payload.platform);
      return await SyncOrchestrator.handleAcceptedSubmission(payload);
    }

    case 'RETRY_SYNC': {
      const { syncId } = payload;
      const history = await StorageManager.getHistory();
      const item = history.find(h => h.id === syncId);
      if (!item || !item.rawSubmission) {
        throw new Error('Sync item or raw submission details not found for retry.');
      }
      const settings = await StorageManager.getSettings();
      return await SyncOrchestrator.executeSyncWorkflow(syncId, item.rawSubmission, settings);
    }

    case 'TEST_GITHUB_CONNECTION': {
      const { pat } = payload;
      const client = new GitHubClient(pat);
      const user = await client.verifyAuth();
      return { success: true, user };
    }

    case 'FETCH_GITHUB_REPOS': {
      const { pat } = payload;
      const client = new GitHubClient(pat);
      const repos = await client.listRepositories();
      return { success: true, repos };
    }

    case 'CREATE_GITHUB_REPO': {
      const { pat, name, description, isPrivate } = payload;
      const client = new GitHubClient(pat);
      const newRepo = await client.createRepository({ name, description, isPrivate });
      return { success: true, repo: newRepo };
    }

    case 'FETCH_GITHUB_BRANCHES': {
      const { pat, owner, repo } = payload;
      const client = new GitHubClient(pat);
      const branches = await client.listBranches(owner, repo);
      return { success: true, branches };
    }

    case 'TEST_AI_CONNECTION': {
      const { aiSettings } = payload;
      const testProblem = {
        title: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        platform: 'LeetCode',
        originalLanguage: 'Python',
        originalCode: 'class Solution:\n    def twoSum(self, nums, target):\n        lookup = {}\n        for i, n in enumerate(nums):\n            diff = target - n\n            if diff in lookup:\n                return [lookup[diff], i]\n            lookup[n] = i',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.'
      };

      const result = await AIService.generateDocumentation({
        settings: aiSettings,
        problem: testProblem,
        targetLanguages: ['java', 'python', 'cpp', 'rust']
      });

      return { success: true, sampleResult: result };
    }

    case 'TRIGGER_TEST_SYNC': {
      // Simulate an accepted submission end-to-end for testing
      const testSubmission = {
        platform: 'LeetCode',
        problemId: '1-two-sum',
        title: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        originalLanguage: 'Python',
        originalCode: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, num in enumerate(nums):\n            comp = target - num\n            if comp in seen:\n                return [seen[comp], i]\n            seen[num] = i\n        return []',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\nAssume that each input has exactly one solution, and you may not use the same element twice.',
        runtime: '45 ms',
        memory: '17.8 MB',
        timestamp: Date.now()
      };
      return await SyncOrchestrator.handleAcceptedSubmission(testSubmission);
    }

    case 'GET_STATUS_SUMMARY': {
      const settings = await StorageManager.getSettings();
      const history = await StorageManager.getHistory();
      const total = history.length;
      const successful = history.filter(h => h.status === 'SUCCESS').length;
      const failed = history.filter(h => h.status === 'FAILED').length;
      const pending = history.filter(h => ['PENDING', 'GENERATING', 'UPLOADING'].includes(h.status)).length;

      return {
        success: true,
        summary: {
          total,
          successful,
          failed,
          pending,
          isGitHubConnected: Boolean(settings.github.pat && settings.github.repoName),
          isAiConnected: Boolean(settings.ai.apiKey || settings.ai.provider === 'custom'),
          repoName: settings.github.repoName || 'Not Set',
          rootFolder: settings.github.rootFolder || 'DSA',
          platformPaths: settings.github.platformPaths,
          platforms: settings.platforms,
          fileFormat: settings.github.fileFormat || 'md',
          provider: settings.ai.provider,
          recentSyncs: history.slice(0, 10)
        }
      };
    }

    default:
      return { success: false, error: `Unknown message type: ${type}` };
  }
}

// Notification click handler - opens commit on success, or opens options page if setup/key is needed
chrome.notifications.onClicked.addListener(async () => {
  const history = await StorageManager.getHistory();
  const latest = history[0];
  if (latest && latest.status === 'SUCCESS' && latest.commitUrl) {
    chrome.tabs.create({ url: latest.commitUrl });
  } else {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    }
  }
});
