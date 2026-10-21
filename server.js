/**
 * AlgoSync AI - Local Development & Preview Server
 * Provides:
 * 1. Static file server for extension UI (Options Dashboard, Popup)
 * 2. Backend API proxy to emulate Chrome background service worker
 * 3. One-click Chrome launcher with extension pre-loaded
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';

import { SyncOrchestrator } from './src/orchestrator/syncOrchestrator.js';
import { StorageManager } from './src/storage/storageManager.js';
import { GitHubClient } from './src/github/githubClient.js';
import { AIService } from './src/ai/aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

async function handleApiMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case 'SUBMISSION_ACCEPTED':
      return await SyncOrchestrator.handleAcceptedSubmission(payload);

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
        description: 'Given an array of integers nums and an integer target, return indices of two numbers such that they add up to target.'
      };

      const result = await AIService.generateDocumentation({
        settings: aiSettings,
        problem: testProblem,
        targetLanguages: ['java', 'python', 'cpp', 'rust']
      });

      return { success: true, sampleResult: result };
    }

    case 'TRIGGER_TEST_SYNC': {
      const testSubmission = {
        platform: 'LeetCode',
        problemId: '1-two-sum',
        title: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        originalLanguage: 'Python',
        originalCode: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, num in enumerate(nums):\n            comp = target - num\n            if comp in seen:\n                return [seen[comp], i]\n            seen[num] = i\n        return []',
        description: 'Given an array of integers nums and an integer target, return indices of two numbers such that they add up to target.',
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

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Route: Emulate Chrome Runtime message
  if (pathname === '/api/message' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const message = JSON.parse(body || '{}');
        const responseData = await handleApiMessage(message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API Route: Launch Chrome with extension loaded
  if (pathname === '/api/launch-chrome') {
    const extDir = __dirname;
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    const browserExe = chromePaths.find(p => fs.existsSync(p));
    if (browserExe) {
      const args = [
        `--load-extension=${extDir}`,
        `--auto-open-devtools-for-tabs`,
        `http://localhost:${PORT}/options/options.html`
      ];
      spawn(browserExe, args, { detached: true, stdio: 'ignore' }).unref();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Launched ${path.basename(browserExe)} with extension loaded!` }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Could not find Chrome or Edge executable automatically.' }));
    }
    return;
  }

  // Serve Index / Landing Page
  if (pathname === '/' || pathname === '/index.html') {
    const landingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AlgoSync AI - Launcher</title>
  <style>
    body {
      margin: 0; padding: 0;
      background: #0B0F19; color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .launcher-card {
      width: 600px; max-width: 90vw;
      background: rgba(22, 30, 49, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px; padding: 36px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      text-align: center;
    }
    h1 {
      font-size: 26px; margin: 0 0 10px 0;
      background: linear-gradient(135deg, #818CF8, #C084FC);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    p { color: #94A3B8; font-size: 14px; margin-bottom: 28px; line-height: 1.5; }
    .btn-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .btn {
      padding: 14px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
      text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 10px;
      cursor: pointer; border: none; transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366F1, #4F46E5); color: white;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover { transform: translateY(-1px); background: #4338CA; }
    .btn-secondary {
      background: #1E293B; color: #F8FAFC; border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-secondary:hover { background: #334155; }
    .info-box {
      background: rgba(0, 0, 0, 0.25); border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: 8px; padding: 14px; text-align: left; font-size: 12.5px; color: #CBD5E1;
    }
    .info-box code { color: #34D399; font-family: monospace; }
  </style>
</head>
<body>
  <div class="launcher-card">
    <h1>AlgoSync AI</h1>
    <p>DSA Auto-Sync & GitHub Portfolio Chrome Extension</p>

    <div class="btn-grid">
      <button class="btn btn-primary" onclick="launchInChrome()">
        🚀 Launch Chrome with Extension Pre-Loaded
      </button>
      <a class="btn btn-secondary" href="/options/options.html" target="_blank">
        📊 Open Full Options & Dashboard (Web Preview)
      </a>
      <a class="btn btn-secondary" href="/popup/popup.html" target="_blank">
        📱 Open Extension Popup (Web Preview)
      </a>
    </div>

    <div class="info-box">
      <strong>To Install Permanently in Chrome:</strong><br>
      1. Open <code>chrome://extensions/</code> in Chrome.<br>
      2. Enable <strong>Developer mode</strong> (top-right).<br>
      3. Click <strong>Load unpacked</strong> and select:<br>
      <code>${__dirname}</code>
    </div>
  </div>

  <script>
    async function launchInChrome() {
      const btn = event.target;
      btn.innerText = 'Launching Chrome...';
      try {
        const res = await fetch('/api/launch-chrome');
        const data = await res.json();
        if (data.success) {
          btn.innerText = 'Chrome Launched! ✓';
        } else {
          alert('Could not launch automatically: ' + data.error + '\\nPlease open chrome://extensions and load unpacked.');
          btn.innerText = 'Launch Chrome';
        }
      } catch (e) {
        btn.innerText = 'Launch Failed';
      }
    }
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landingHtml);
    return;
  }

  // Serve static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  // Check if file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`AlgoSync AI Server running at: http://localhost:${PORT}`);
  console.log(`- Options Dashboard: http://localhost:${PORT}/options/options.html`);
  console.log(`- Extension Popup:   http://localhost:${PORT}/popup/popup.html`);
  console.log(`======================================================\n`);
});
