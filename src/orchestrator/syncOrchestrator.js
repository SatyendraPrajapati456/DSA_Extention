/**
 * Sync Orchestrator
 * Coordinates submission detection, deduplication, AI generation,
 * template rendering, platform-specific custom path resolution, GitHub uploading,
 * and notifications.
 */

import { StorageManager } from '../storage/storageManager.js';
import { AIService } from '../ai/aiService.js';
import { TemplateRenderer } from '../renderer/templateRenderer.js';
import { GitHubClient } from '../github/githubClient.js';
import { getDefaultPlatformPaths } from '../constants/defaultSettings.js';

export class SyncOrchestrator {
  /**
   * Main entry point when a platform detects an accepted submission
   * @param {Object} submission 
   */
  static async handleAcceptedSubmission(submission) {
    const signature = `${submission.platform}_${submission.problemId || submission.title}_${submission.originalLanguage || ''}`;
    
    // Deduplication check (skip if processed within the last 30s)
    const isDup = await StorageManager.isDuplicateSubmission(signature);
    if (isDup) {
      console.log(`[AlgoSync] Skipped duplicate submission: ${signature}`);
      return { success: false, reason: 'DUPLICATE' };
    }

    // Historical sync check: skip if identical problem & accepted code has already been successfully synced
    const history = await StorageManager.getHistory();
    const cleanCurrentCode = (submission.originalCode || '').trim();
    const alreadySynced = history.some(item => {
      if (item.status !== 'SUCCESS') return false;
      if (item.platform !== submission.platform) return false;
      const titleMatches = item.problemTitle && submission.title &&
        item.problemTitle.toLowerCase().trim() === submission.title.toLowerCase().trim();
      const rawCode = (item.rawSubmission?.originalCode || '').trim();
      return titleMatches && rawCode && cleanCurrentCode && rawCode === cleanCurrentCode;
    });

    if (alreadySynced) {
      console.log(`[AlgoSync] Problem "${submission.title}" with identical code was already synced successfully in history. Skipping.`);
      return { success: false, reason: 'ALREADY_SYNCED' };
    }

    const settings = await StorageManager.getSettings();

    // Check if platform is enabled
    const platformKey = (submission.platform || '').toLowerCase().replace(/[^a-z]/g, '');
    if (settings.platforms[platformKey] === false) {
      console.log(`[AlgoSync] Platform "${submission.platform}" is disabled in settings.`);
      return { success: false, reason: 'PLATFORM_DISABLED' };
    }

    // Check if auto-sync is enabled
    if (settings.syncPreferences.autoSyncOnAccept === false) {
      console.log(`[AlgoSync] Auto-sync is paused in settings.`);
      return { success: false, reason: 'AUTO_SYNC_PAUSED' };
    }

    // Initialize history record
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await StorageManager.recordSync({
      id: syncId,
      platform: submission.platform,
      problemTitle: submission.title,
      problemUrl: submission.url,
      language: submission.originalLanguage || 'Unknown',
      status: 'PENDING',
      rawSubmission: submission,
      timestamp: Date.now()
    });

    return await this.executeSyncWorkflow(syncId, submission, settings);
  }

  /**
   * Executes the full pipeline (or retries an existing sync)
   */
  static async executeSyncWorkflow(syncId, submission, settings) {
    try {
      // Step 1: Pre-flight Configuration Validation
      if (!settings.github.pat || !settings.github.repoName) {
        throw new Error('GitHub account or repository not configured. Please complete setup in AlgoSync Options.');
      }

      const apiKeys = AIService.extractApiKeys(settings.ai);
      if (apiKeys.length === 0 && settings.ai.provider !== 'custom') {
        throw new Error(`AI Provider (${settings.ai.provider.toUpperCase()}) API key is missing. Configure it in AlgoSync Options.`);
      }

      // Step 2: AI Generation
      await StorageManager.updateSyncStatus(syncId, { status: 'GENERATING' });
      
      const targetLanguages = settings.ai.languages && settings.ai.languages.length > 0 
        ? settings.ai.languages 
        : ['java', 'python', 'cpp', 'rust'];

      let aiResult;
      let usedFallback = false;
      try {
        aiResult = await AIService.generateDocumentation({
          settings: settings.ai,
          problem: submission,
          targetLanguages
        });
      } catch (aiErr) {
        console.warn('[AlgoSync] All AI keys and models were busy or unavailable. Generating safe preserved documentation:', aiErr);
        aiResult = AIService.generateFallbackDocumentation(submission, targetLanguages, aiErr.message);
        usedFallback = true;
      }

      // Step 3: Template Rendering (Markdown or Plain Text)
      const fileFormat = settings.github.fileFormat || 'md';
      const generatedContent = TemplateRenderer.render({
        problem: submission,
        aiAnalysis: aiResult.approach,
        testCases: aiResult.testCases,
        languages: aiResult.languages,
        motivation: aiResult.motivation
      }, fileFormat);

      // Step 4: Resolve Platform-Specific File Path
      const primaryTopic = (aiResult.topics && aiResult.topics[0]) || 'Algorithms';
      const filePath = this.resolvePlatformFilePath({
        settings,
        platform: submission.platform,
        topic: primaryTopic,
        title: submission.title,
        extension: fileFormat
      });

      // Step 5: Upload to GitHub
      await StorageManager.updateSyncStatus(syncId, {
        status: 'UPLOADING',
        filePath,
        generatedContent
      });

      const ghClient = new GitHubClient(settings.github.pat);
      const owner = settings.github.repoOwner || settings.github.username;
      const repo = settings.github.repoName;
      const branch = settings.github.branch || 'main';

      const uploadResult = await ghClient.uploadFile({
        owner,
        repo,
        branch,
        path: filePath,
        content: generatedContent,
        commitMessage: `Auto-Sync: [${submission.platform}] ${submission.title} - Accepted Solution`
      });

      // Step 6: Mark as SUCCESS
      const completedRecord = await StorageManager.updateSyncStatus(syncId, {
        status: 'SUCCESS',
        commitUrl: uploadResult.commitUrl,
        filePath: filePath,
        error: null
      });

      // Step 7: Notify User
      if (settings.syncPreferences.showNotifications) {
        const notifTitle = usedFallback
          ? 'AlgoSync: Solution Synced! 🚀 (Preserved)'
          : 'AlgoSync: Solution Synced! 🚀';
        const notifMsg = usedFallback
          ? `Accepted submission saved to GitHub!\nOriginal ${submission.originalLanguage || 'code'} preserved.\nUploaded to: ${filePath}\n(AI models were busy)`
          : `Accepted submission detected!\nAI documentation generated.\nUploaded to: ${filePath}`;

        this.sendNotification({
          title: notifTitle,
          message: notifMsg
        });
      }

      return { success: true, record: completedRecord };

    } catch (error) {
      console.error('[AlgoSync] Sync workflow failed:', error);
      
      const failedRecord = await StorageManager.updateSyncStatus(syncId, {
        status: 'FAILED',
        error: error.message || 'Unknown synchronization error'
      });

      if (settings.syncPreferences.showNotifications) {
        this.sendNotification({
          title: 'AlgoSync: Sync Failed ⚠️',
          message: `Could not document "${submission.title}": ${error.message}`
        });
      }

      return { success: false, error: error.message, record: failedRecord };
    }
  }

  /**
   * Resolves target file path based on user's custom platform paths and root folder
   */
  static resolvePlatformFilePath({ settings, platform, topic, title, extension = 'md' }) {
    const platformKey = (platform || '').toLowerCase().replace(/[^a-z]/g, '');
    const userPlatformPaths = settings.github?.platformPaths || getDefaultPlatformPaths(settings.github?.rootFolder || 'DSA');
    
    // Get custom folder for this platform or fallback to default
    let folderPath = userPlatformPaths[platformKey];
    if (!folderPath) {
      const defaultPaths = getDefaultPlatformPaths(settings.github?.rootFolder || 'DSA');
      folderPath = defaultPaths[platformKey] || (settings.github?.rootFolder ? `${settings.github.rootFolder}/${platform}` : platform);
    }

    // Sanitize path against directory traversal (../) and illegal characters
    const cleanFolder = this.sanitizePath(folderPath);
    const sanitizedTitle = TemplateRenderer.sanitizeFilename(title);
    const cleanTopic = (topic || 'General').replace(/[\\/*?:"<>|]/g, '').trim();

    let fullPath = '';
    if (settings.github?.includeTopicSubfolder) {
      fullPath = `${cleanFolder}/${cleanTopic}/${sanitizedTitle}.${extension}`;
    } else {
      fullPath = `${cleanFolder}/${sanitizedTitle}.${extension}`;
    }

    // Clean any accidental duplicate slashes
    return fullPath.replace(/\/+/g, '/').replace(/^\/+/, '');
  }

  /**
   * Sanitizes folder paths, removes leading/trailing slashes and directory traversal
   */
  static sanitizePath(pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return 'DSA';
    return pathStr
      .replace(/\.\.+/g, '') // prevent directory traversal (..)
      .replace(/[\\:*?"<>|]/g, '') // remove illegal characters
      .replace(/^\/+|\/+$/g, '') // trim leading/trailing slashes
      .replace(/\/+/g, '/'); // remove duplicate slashes
  }

  /**
   * Sends desktop notification via Chrome notifications API
   */
  static sendNotification({ title, message }) {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: title,
        message: message,
        priority: 1
      });
    }
  }
}
