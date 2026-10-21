# AlgoSync AI — DSA Auto-Sync & GitHub Portfolio Chrome Extension

> **Turn your accepted DSA submissions into structured, multilingual problem documents and automatically organize them into custom GitHub folder paths per platform.**

---

## 🌟 Overview

**AlgoSync AI** is a production-ready, Manifest V3 Chrome Extension that bridges competitive programming platforms and GitHub. Whenever you solve a problem and achieve an **Accepted** verdict on LeetCode, GeeksforGeeks, Codeforces, CodeChef, HackerRank, or HackerEarth, AlgoSync automatically:

1. **Captures the verified submission** (Problem Title, URL, Statement, Original Code, Runtime, Memory).
2. **Preserves your original code** in its submitted language, distinctly labeled from AI-generated solutions.
3. **Analyzes your approach using an AI Engine** (Google Gemini, OpenAI, Groq, or Custom/Ollama).
4. **Produces multi-language implementations** in **Java, Python, C++, and Rust** with language-specific concepts and requirements.
5. **Renders the problem document** in either Markdown (`.md` with syntax highlighting — Recommended) or Plain Text (`.txt`).
6. **Uploads and commits the document** directly to your **custom platform-specific folder path** in your GitHub repository.

---

## 🚀 Key Features

- **Custom Folder Paths Per Platform (Section 6 Spec)**:
  - Users can configure their **DSA Root Folder** (e.g. `DSA`, `CompetitiveProgramming`, `MyDSA`, or empty for repository root).
  - Every platform has an **individually editable destination path**:
    - **LeetCode**: default `DSA/LeetCode` (or `CompetitiveProgramming/LeetCode`)
    - **GeeksforGeeks**: default `DSA/GFG`
    - **Codeforces**: default `DSA/Codeforces`
    - **CodeChef**: default `DSA/CodeChef`
    - **HackerRank**: default `DSA/HackerRank`
    - **HackerEarth**: default `DSA/HackerEarth`
  - "Restore Defaults" button recomputes default paths dynamically based on your chosen Root Folder.
  - Path traversal protection (`..` prevention) and invalid character sanitization.
- **Dedicated Dashboard (Section 4.2 Spec)**:
  - GitHub connection status, connected repository, and root folder.
  - Checklist of enabled platforms (`✓ LeetCode`, `✓ GFG`, `✓ Codeforces`, etc.).
  - Real-time statistics: Accepted Problems, Documents Uploaded, Pending Tasks, Failed Tasks.
  - Recent activity feed with direct links to GitHub commits.
  - Quick action buttons: `[Open Settings]`, `[View History]`, `[Sync Pending Tasks]`.
- **First-Time Setup Wizard (Section 4.3 Spec)**:
  - Guided 5-step timeline covering Token Setup, Repo Selection, Folder Configuration, AI Model, and Test Pipeline.
- **6 Supported Platforms**:
  - [x] **LeetCode**
  - [x] **GeeksforGeeks (GFG)**
  - [x] **Codeforces**
  - [x] **CodeChef**
  - [x] **HackerRank**
  - [x] **HackerEarth**
- **Strict Problem Document Format**:
  - **Title**: `# Problem Name`
  - **Section 1**: Problem Details (Platform, Question Link, Question Name, Question Description)
  - **Section 2**: 3–4 Valid Test Cases (Input, Output, Explanation)
  - **Section 3**: AI-Generated Approach (Approach: Algorithm, Idea, Reasoning, Time Complexity, Space Complexity)
  - **Section 4**: Java Solution (Concepts, Original Accepted Submission if Java, AI Alternative)
  - **Section 5**: Python Solution (Concepts, Original Accepted Submission if Python, AI Alternative)
  - **Section 6**: C++ Solution (Concepts, Original Accepted Submission if C++, AI Alternative)
  - **Section 7**: Rust Solution (Concepts, Original Accepted Submission if Rust, AI Alternative)
  - **Section 8**: Motivation Line
  - **Section 9**: Centered `<div align="center"> ## Thank You 🚀 </div>`
- **Preserved Original Submissions**:
  - Your actual submitted code is never silently replaced by AI code.
  - If you submit in a language outside the standard four (e.g. JavaScript, Go, Kotlin), a dedicated section preserves your original code while generating Java, Python, C++, and Rust alternatives!
- **Multi-Provider AI Abstraction**:
  - **Google Gemini**: Gemini 2.0 Flash / 1.5 Flash (Ultra-fast & free tier available).
  - **OpenAI**: GPT-4o / GPT-4o-mini.
  - **Groq Cloud**: Llama 3.3 70B / Llama 3.1 8B (Sub-second generation).
  - **Custom / Ollama**: Any OpenAI-compatible local or remote endpoint.

---

## 📦 How to Install (Load Unpacked in Chrome)

1. Open Google Chrome (or any Chromium browser like Brave, Edge, Opera).
2. In the URL bar, go to `chrome://extensions/`.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left.
5. Select this folder:
   ```
   d:\Coding Staf\Web Development\DSA_Extention
   ```
6. The **AlgoSync AI** extension icon will appear in your Chrome toolbar!

---

## ⚙️ Configuration Guide

1. Click on the **AlgoSync AI** extension icon and click **Full Dashboard ↗**.
2. **GitHub & Folders Tab**:
   - Paste a GitHub Personal Access Token with `repo` permissions and click **Verify & Connect**.
   - Select your repository (e.g., `username/DSA` or `username/coding-practice`).
   - Enter your **DSA Root Folder** (e.g. `DSA` or `CompetitiveProgramming`).
   - Review or customize the destination path for each platform in the **Platform Destination Paths** table:
     ```
     LeetCode      -> DSA/LeetCode
     GeeksforGeeks -> DSA/GFG
     Codeforces    -> DSA/Codeforces
     CodeChef      -> DSA/CodeChef
     HackerRank    -> DSA/HackerRank
     HackerEarth   -> DSA/HackerEarth
     ```
   - Choose your preferred document format: **Markdown (`.md`)** or **Plain Text (`.txt`)**.
3. **AI Engine & Models Tab**:
   - Choose your provider (Google Gemini, OpenAI, Groq, or Custom).
   - Enter your API Key and click **Test AI Connection**.
4. **Click "Save Settings"**.

---

## 🧪 Testing the End-to-End Pipeline

To verify the setup without opening a contest platform:
1. Go to the **Diagnostics & Test** tab in the dashboard.
2. Click **Run End-to-End Test Sync**.
3. AlgoSync will simulate an accepted submission for *Two Sum*, analyze it, format the document with multi-language code, resolve the custom destination path (e.g., `DSA/LeetCode/Two Sum.md`), and upload it directly to your GitHub repository!

---

## 📁 Repository Organization Example

```
username/DSA/
└── DSA/                               <-- Configurable Root Folder
    ├── LeetCode/                      <-- Configurable LeetCode Path
    │   ├── Two Sum.md
    │   └── Climbing Stairs.md
    ├── GFG/                           <-- Configurable GFG Path
    │   └── Binary Search.md
    ├── Codeforces/                    <-- Configurable Codeforces Path
    │   └── Watermelon.md
    ├── CodeChef/                      <-- Configurable CodeChef Path
    │   └── Chef and Strings.md
    ├── HackerRank/                    <-- Configurable HackerRank Path
    │   └── Array Manipulation.md
    └── HackerEarth/                   <-- Configurable HackerEarth Path
        └── Monk and Inversions.md
```

---

## 🛠️ Project Structure

```
DSA_Extention/
├── manifest.json              # Chrome Extension MV3 Manifest
├── generate-icons.js          # Standalone icon builder
├── test-runner.js             # Automated verification test suite (44 tests)
├── icons/                     # 16, 32, 48, 128 px icons
├── background/
│   └── service-worker.js      # Background service worker & event dispatcher
├── content-scripts/
│   ├── common.js              # HUD widget & DOM extraction utilities
│   ├── leetcode.js            # LeetCode submission observer
│   ├── geeksforgeeks.js       # GFG submission observer
│   ├── codeforces.js          # Codeforces verdict observer
│   ├── codechef.js            # CodeChef verdict observer
│   ├── hackerrank.js          # HackerRank verdict observer
│   └── hackerearth.js         # HackerEarth verdict observer
├── popup/
│   ├── popup.html             # Action popup with live badges & stats
│   ├── popup.css              # Dark glassmorphic popup styling
│   └── popup.js               # Popup controller
├── options/
│   ├── options.html           # Full options, dashboard & wizard UI
│   ├── options.css            # Dashboard styling & UI components
│   └── options.js             # Settings management & custom paths table
└── src/
    ├── constants/
    │   ├── topics.js          # Hierarchical DSA topic classification taxonomy
    │   └── defaultSettings.js # Default models, platforms & path generators
    ├── storage/
    │   └── storageManager.js  # Chrome storage abstraction & sync history
    ├── renderer/
    │   └── templateRenderer.js# Multi-format renderer (.md & .txt)
    ├── ai/
    │   └── aiService.js       # Multi-provider AI service (Gemini, OpenAI, Groq, Ollama)
    ├── github/
    │   └── githubClient.js    # GitHub REST API client & repo manager
    └── orchestrator/
        └── syncOrchestrator.js# Master sync coordinator with path resolution
```

---

**Built with precision for competitive programmers and software engineers worldwide.**
