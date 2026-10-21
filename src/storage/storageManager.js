/**
 * Storage Manager for AlgoSync Chrome Extension
 * Provides unified access to chrome.storage.local with defaults and validation,
 * with graceful fallback to localStorage when viewed in standalone web mode.
 */

import { DEFAULT_SETTINGS } from '../constants/defaultSettings.js';

const STORAGE_KEYS = {
  SETTINGS: 'algosync_settings',
  SYNC_HISTORY: 'algosync_history',
  SYNC_QUEUE: 'algosync_queue',
  DEDUP_CACHE: 'algosync_dedup'
};

const MAX_HISTORY_ITEMS = 200;

function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

export class StorageManager {
  /**
   * Retrieves all user settings with defaults merged
   */
  static async getSettings() {
    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
          const stored = result[STORAGE_KEYS.SETTINGS] || {};
          resolve(StorageManager.mergeSettings(stored));
        });
      });
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        const stored = raw ? JSON.parse(raw) : {};
        return StorageManager.mergeSettings(stored);
      } catch {
        return StorageManager.mergeSettings({});
      }
    }
  }

  static mergeSettings(stored) {
    return {
      github: { ...DEFAULT_SETTINGS.github, ...(stored.github || {}) },
      ai: { ...DEFAULT_SETTINGS.ai, ...(stored.ai || {}) },
      platforms: { ...DEFAULT_SETTINGS.platforms, ...(stored.platforms || {}) },
      syncPreferences: { ...DEFAULT_SETTINGS.syncPreferences, ...(stored.syncPreferences || {}) }
    };
  }

  /**
   * Updates partial or full settings
   */
  static async updateSettings(partialSettings) {
    const current = await this.getSettings();
    const updated = {
      github: { ...current.github, ...(partialSettings.github || {}) },
      ai: { ...current.ai, ...(partialSettings.ai || {}) },
      platforms: { ...current.platforms, ...(partialSettings.platforms || {}) },
      syncPreferences: { ...current.syncPreferences, ...(partialSettings.syncPreferences || {}) }
    };

    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated }, () => {
          resolve(updated);
        });
      });
    } else {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    }
  }

  /**
   * Gets the sync history items
   */
  static async getHistory() {
    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.SYNC_HISTORY], (result) => {
          resolve(result[STORAGE_KEYS.SYNC_HISTORY] || []);
        });
      });
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SYNC_HISTORY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  }

  /**
   * Adds or updates a sync record in history
   * @param {Object} item 
   */
  static async recordSync(item) {
    const history = await this.getHistory();
    const existingIndex = history.findIndex(h => h.id === item.id);

    const record = {
      id: item.id || `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform: item.platform,
      problemTitle: item.problemTitle,
      problemUrl: item.problemUrl,
      language: item.language,
      status: item.status, // 'PENDING' | 'GENERATING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
      filePath: item.filePath || '',
      commitUrl: item.commitUrl || '',
      error: item.error || null,
      generatedContent: item.generatedContent || null,
      rawSubmission: item.rawSubmission || null,
      timestamp: item.timestamp || Date.now(),
      retryCount: item.retryCount || 0
    };

    if (existingIndex >= 0) {
      history[existingIndex] = { ...history[existingIndex], ...record };
    } else {
      history.unshift(record);
      if (history.length > MAX_HISTORY_ITEMS) {
        history.pop();
      }
    }

    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.SYNC_HISTORY]: history }, () => {
          resolve(record);
        });
      });
    } else {
      localStorage.setItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(history));
      return record;
    }
  }

  /**
   * Updates status of an existing sync record
   */
  static async updateSyncStatus(id, updates) {
    const history = await this.getHistory();
    const index = history.findIndex(h => h.id === id);
    if (index >= 0) {
      history[index] = { ...history[index], ...updates };
      if (isChromeStorageAvailable()) {
        await new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEYS.SYNC_HISTORY]: history }, resolve));
      } else {
        localStorage.setItem(STORAGE_KEYS.SYNC_HISTORY, JSON.stringify(history));
      }
      return history[index];
    }
    return null;
  }

  /**
   * Checks if a submission was already processed recently (deduplication within 60s)
   */
  static async isDuplicateSubmission(submissionSignature) {
    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.DEDUP_CACHE], (result) => {
          const cache = result[STORAGE_KEYS.DEDUP_CACHE] || {};
          const now = Date.now();
          
          for (const [key, time] of Object.entries(cache)) {
            if (now - time > 120000) delete cache[key];
          }

          if (cache[submissionSignature] && (now - cache[submissionSignature] < 30000)) {
            resolve(true);
          } else {
            cache[submissionSignature] = now;
            chrome.storage.local.set({ [STORAGE_KEYS.DEDUP_CACHE]: cache }, () => {
              resolve(false);
            });
          }
        });
      });
    } else {
      return false;
    }
  }

  /**
   * Clears the sync history
   */
  static async clearHistory() {
    if (isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.SYNC_HISTORY]: [] }, resolve);
      });
    } else {
      localStorage.removeItem(STORAGE_KEYS.SYNC_HISTORY);
    }
  }
}
