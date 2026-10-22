/**
 * Comprehensive Verification Script for AlgoSync Chrome Extension
 * Tests:
 * 1. Topic Taxonomy & Normalization
 * 2. Default Settings & Platform Paths
 * 3. Custom Platform Path Resolution & Traversal Prevention
 * 4. Markdown (.md) Template Rendering (Section 8 & 9 Spec)
 * 5. Plain Text (.txt) Template Rendering (Section 6 Spec)
 * 6. Non-Standard Language Preservation (e.g. JavaScript, Go)
 * 7. GitHub UTF-8 Base64 Encoding
 * 8. Manifest V3 Integrity
 */

import fs from 'fs';
import path from 'path';
import { normalizeTopics, ALL_TOPICS } from './src/constants/topics.js';
import { DEFAULT_SETTINGS, getDefaultPlatformPaths, AI_PROVIDERS } from './src/constants/defaultSettings.js';
import { TemplateRenderer } from './src/renderer/templateRenderer.js';
import { SyncOrchestrator } from './src/orchestrator/syncOrchestrator.js';
import { GitHubClient } from './src/github/githubClient.js';
import { AIService } from './src/ai/aiService.js';

console.log('--- RUNNING COMPREHENSIVE ALGOSYNC TEST SUITE ---');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// 1. Test Topics Taxonomy
console.log('\n[1] Testing Topic Taxonomy & Normalization...');
assert(ALL_TOPICS.length > 25, `ALL_TOPICS has ${ALL_TOPICS.length} predefined topics.`);
const normalized = normalizeTopics(['arrays', 'hash table', 'two-pointers', 'custom unknown topic']);
assert(normalized.includes('Arrays'), 'Normalized "arrays" -> "Arrays"');
assert(normalized.includes('Two Pointers'), 'Normalized "two-pointers" -> "Two Pointers"');

// 2. Test Default Settings & Platform Paths
console.log('\n[2] Testing Default Settings & Platform Paths...');
assert(DEFAULT_SETTINGS.github.repoName === 'DSA', 'Default repo is DSA');
assert(DEFAULT_SETTINGS.github.rootFolder === 'DSA', 'Default root folder is DSA');
assert(DEFAULT_SETTINGS.github.fileFormat === 'md', 'Default document format is Markdown (.md)');

const defaultPaths = getDefaultPlatformPaths('DSA');
assert(defaultPaths.leetcode === 'DSA/LeetCode', 'Default LeetCode path is DSA/LeetCode');
assert(defaultPaths.geeksforgeeks === 'DSA/GFG', 'Default GFG path is DSA/GFG');
assert(defaultPaths.codeforces === 'DSA/Codeforces', 'Default Codeforces path is DSA/Codeforces');
assert(defaultPaths.codechef === 'DSA/CodeChef', 'Default CodeChef path is DSA/CodeChef');
assert(defaultPaths.hackerrank === 'DSA/HackerRank', 'Default HackerRank path is DSA/HackerRank');
assert(defaultPaths.hackerearth === 'DSA/HackerEarth', 'Default HackerEarth path is DSA/HackerEarth');

const customRootPaths = getDefaultPlatformPaths('CompetitiveProgramming');
assert(customRootPaths.leetcode === 'CompetitiveProgramming/LeetCode', 'Custom root generates CompetitiveProgramming/LeetCode');
assert(customRootPaths.geeksforgeeks === 'CompetitiveProgramming/GFG', 'Custom root generates CompetitiveProgramming/GFG');

const emptyRootPaths = getDefaultPlatformPaths('');
assert(emptyRootPaths.leetcode === 'LeetCode', 'Empty root generates LeetCode at root');

// 3. Test Custom Path Resolution & Traversal Prevention
console.log('\n[3] Testing Path Sanitization & Resolution...');
const traversalTest = SyncOrchestrator.sanitizePath('../../DSA/../LeetCode/');
assert(!traversalTest.includes('..'), 'Directory traversal (..) stripped');
assert(traversalTest === 'DSA/LeetCode', `Sanitized to "DSA/LeetCode" (got: ${traversalTest})`);

const illegalCharTest = SyncOrchestrator.sanitizePath('DSA/Leet:Code*?');
assert(!/[\\:*?"<>|]/.test(illegalCharTest), 'Illegal characters removed');

const mockSettings = {
  github: {
    rootFolder: 'DSA',
    fileFormat: 'md',
    includeTopicSubfolder: false,
    platformPaths: {
      leetcode: 'DSA/LeetCode',
      geeksforgeeks: 'Practice/GFG',
      codeforces: 'Contests/Codeforces'
    }
  }
};

const resolvedPath1 = SyncOrchestrator.resolvePlatformFilePath({
  settings: mockSettings,
  platform: 'LeetCode',
  topic: 'Arrays',
  title: 'Two Sum',
  extension: 'md'
});
assert(resolvedPath1 === 'DSA/LeetCode/Two Sum.md', `Resolved standard path: ${resolvedPath1}`);

const resolvedPath2 = SyncOrchestrator.resolvePlatformFilePath({
  settings: mockSettings,
  platform: 'GeeksforGeeks',
  topic: 'Searching',
  title: 'Binary Search',
  extension: 'md'
});
assert(resolvedPath2 === 'Practice/GFG/Binary Search.md', `Resolved custom GFG path: ${resolvedPath2}`);

// With topic subfolder enabled
const topicSubfolderSettings = {
  github: {
    ...mockSettings.github,
    includeTopicSubfolder: true
  }
};
const resolvedTopicPath = SyncOrchestrator.resolvePlatformFilePath({
  settings: topicSubfolderSettings,
  platform: 'LeetCode',
  topic: 'Arrays',
  title: 'Two Sum',
  extension: 'md'
});
assert(resolvedTopicPath === 'DSA/LeetCode/Arrays/Two Sum.md', `Resolved topic subfolder path: ${resolvedTopicPath}`);

// 4. Test Markdown (.md) Template Rendering (Section 8 & 9)
console.log('\n[4] Testing Markdown (.md) Template Rendering...');
const testData = {
  problem: {
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum/',
    platform: 'LeetCode',
    originalLanguage: 'Java',
    originalCode: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        return new int[]{0,1};\n    }\n}',
    description: 'Given an array of integers nums and an integer target, return indices of two numbers whose sum equals target.'
  },
  aiAnalysis: {
    algorithm: 'Hash Map',
    idea: 'Maintain a hash map containing the values encountered and their corresponding indices.',
    steps: ['Traverse array', 'Calculate complement', 'Check hash map', 'Return indices'],
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
      code: 'class Solution { /* Java alternative */ }'
    },
    python: {
      whatIsRequired: ['Lists', 'Dictionaries', 'Hash-based lookup'],
      importantConcepts: ['Lists', 'Dictionaries'],
      code: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]'
    },
    cpp: {
      whatIsRequired: ['Vectors', 'Unordered maps'],
      importantConcepts: ['std::vector', 'std::unordered_map'],
      code: 'class Solution { public: vector<int> twoSum(...) { return {0,1}; } };'
    },
    rust: {
      whatIsRequired: ['Vectors', 'HashMap', 'Ownership and borrowing'],
      importantConcepts: ['Vec', 'HashMap', 'Ownership and borrowing'],
      code: 'impl Solution { pub fn two_sum(...) -> Vec<i32> { vec![0,1] } }'
    }
  },
  motivation: 'Every problem you solve adds another tool to your problem-solving toolkit.'
};

const mdOutput = TemplateRenderer.render(testData, 'md');
assert(mdOutput.includes('# Two Sum'), 'Contains # Two Sum title');
assert(mdOutput.includes('## 1. Problem Details'), 'Contains ## 1. Problem Details');
assert(mdOutput.includes('**Platform:** LeetCode'), 'Contains Platform');
assert(mdOutput.includes('**Question Link:**'), 'Contains Question Link');
assert(mdOutput.includes('## 2. Test Cases'), 'Contains ## 2. Test Cases');
assert(mdOutput.includes('## 3. AI-Generated Approach'), 'Contains ## 3. AI-Generated Approach');
assert(mdOutput.includes('### Approach: Hash Map'), 'Contains Approach: Hash Map');
assert(mdOutput.includes('## 4. Java Solution'), 'Contains ## 4. Java Solution');
assert(mdOutput.includes('### Original Accepted Submission'), 'Contains Original Accepted Submission for submitted Java');
assert(mdOutput.includes('## 5. Python Solution'), 'Contains ## 5. Python Solution');
assert(mdOutput.includes('### AI-Generated Python Implementation'), 'Contains AI-Generated Python Implementation');
assert(mdOutput.includes('## 6. C++ Solution'), 'Contains ## 6. C++ Solution');
assert(mdOutput.includes('## 7. Rust Solution'), 'Contains ## 7. Rust Solution');
assert(mdOutput.includes('## 8. Motivation'), 'Contains ## 8. Motivation');
assert(mdOutput.includes('<div align="center">\n\n## Thank You 🚀\n\n</div>'), 'Contains centered <div align="center"> ## Thank You 🚀 </div>');

// 5. Test Plain Text (.txt) Template Rendering (Section 6)
console.log('\n[5] Testing Plain Text (.txt) Template Rendering...');
const txtOutput = TemplateRenderer.render(testData, 'txt');
assert(txtOutput.includes('============================================================'), 'TXT contains divider banners');
assert(txtOutput.includes('PROBLEM DETAILS'), 'TXT contains PROBLEM DETAILS');
assert(txtOutput.includes('JAVA SOLUTION'), 'TXT contains JAVA SOLUTION');
assert(txtOutput.includes('Thank You! 🚀'), 'TXT contains centered Thank You! 🚀');

// 6. Test Non-Standard Language Preservation (e.g. JavaScript, Go)
console.log('\n[6] Testing Non-Standard Preserved Language...');
const jsTestData = {
  ...testData,
  problem: {
    ...testData.problem,
    originalLanguage: 'JavaScript',
    originalCode: 'var twoSum = function(nums, target) { return [0, 1]; };'
  }
};
const jsMdOutput = TemplateRenderer.render(jsTestData, 'md');
assert(jsMdOutput.includes('## Original JavaScript Accepted Submission'), 'Preserves JavaScript under its own dedicated section');

// 7. Test GitHub UTF-8 Base64 Encoding
console.log('\n[7] Testing GitHub Base64 Encoding...');
const unicodeSample = 'Thank You! 🚀 • ∑(x) = O(n log n) • std::unordered_map<int, int>';
const b64 = GitHubClient.utf8ToBase64(unicodeSample);
const decoded = Buffer.from(b64, 'base64').toString('utf8');
assert(decoded === unicodeSample, 'UTF-8 Base64 round-trip succeeded without corruption');

// 8. Test Manifest.json Integrity
console.log('\n[8] Testing manifest.json...');
const manifestRaw = fs.readFileSync('manifest.json', 'utf8');
const manifest = JSON.parse(manifestRaw);
assert(manifest.manifest_version === 3, 'Manifest version is 3');
assert(manifest.content_scripts.length === 6, 'All 6 platform content scripts registered');

// 9. Test Intelligent Code Language Detection
console.log('\n[9] Testing Code Language Detection...');
const commonScript = fs.readFileSync('content-scripts/common.js', 'utf8');
const sandboxWindow = {};
const evalCommon = new Function('window', commonScript);
evalCommon(sandboxWindow);
const detectLang = sandboxWindow.AlgoSyncCommon.detectLanguageFromCode;

const javaSample = `
import java.io.*;
import java.util.*;

class Result {
    public static long aVeryBigSum(List<Long> ar) {
        long sum = 0;
        for (long num : ar) {
            sum += num;
        }
        return sum;
    }
}

public class Solution {
    public static void main(String[] args) throws IOException {
        System.out.println("Ready");
    }
}
`;

const pythonSample = `
def aVeryBigSum(ar):
    return sum(ar)

if __name__ == '__main__':
    print(aVeryBigSum([1000000001, 1000000002]))
`;

const cppSample = `
#include <iostream>
#include <vector>
using namespace std;

long aVeryBigSum(vector<long> ar) {
    long total = 0;
    for (auto n : ar) total += n;
    return total;
}
`;

assert(detectLang(javaSample) === 'Java', 'Detects HackerRank Java solution as "Java"');
assert(detectLang(pythonSample) === 'Python', 'Detects Python solution as "Python"');
assert(detectLang(cppSample) === 'C++', 'Detects C++ solution as "C++"');

// 10. Test Multi-Key Extraction & Model Failover
console.log('\n[10] Testing Multi-Key Extraction & Model Failover...');

// 10.1 Multi-Key extraction from comma/newline strings
const multiKeysConfig = {
  apiKey: 'AIzaSyKey1, AIzaSyKey2\nAIzaSyKey3; AIzaSyKey4',
  apiKeys: ['AIzaSyKey1', 'AIzaSyKey5']
};
const extractedKeys = AIService.extractApiKeys(multiKeysConfig);
assert(extractedKeys.length === 5, `Extracted and deduplicated 5 distinct keys (got: ${extractedKeys.length})`);
assert(extractedKeys.includes('AIzaSyKey1') && extractedKeys.includes('AIzaSyKey5'), 'Includes keys from both apiKey string and apiKeys array');

// 10.2 Model Candidates fallback list (User preference first, followed by resilient models)
const geminiCandidates = AIService.getModelCandidates('gemini', 'gemini-3.8-flash');
assert(geminiCandidates[0] === 'gemini-3.8-flash', 'User selected model is attempted first');
assert(geminiCandidates.includes('gemini-3.8-flash'), 'Fallback list includes latest gemini-3.8-flash');
assert(geminiCandidates.includes('gemini-3.8-pro'), 'Fallback list includes latest gemini-3.8-pro');
assert(geminiCandidates.includes('gemini-2.5-flash'), 'Fallback list includes active working model gemini-2.5-flash');
assert(geminiCandidates.includes('gemini-2.5-pro'), 'Fallback list includes active working model gemini-2.5-pro');
assert(!geminiCandidates.some(m => m.includes('2.0') || m.startsWith('gemini-1.')), 'Strictly excludes shut down 2.0 and 1.x models');

// 10.3 Fallback documentation generation when all AI is busy
const testProblem = {
  title: 'A. Min Max Game',
  platform: 'Codeforces',
  url: 'https://codeforces.com/problemset/problem/1234/A',
  originalLanguage: 'Java',
  originalCode: 'public class Solution { public static void main(String[] args) {} }',
  description: 'You are given an array of integers.'
};
const fallbackDoc = AIService.generateFallbackDocumentation(testProblem, ['java', 'python', 'cpp', 'rust'], '503 busy');
assert(fallbackDoc.approach && fallbackDoc.approach.algorithm, 'Fallback documentation generates valid approach');
assert(fallbackDoc.languages.java.code === testProblem.originalCode, 'Fallback documentation preserves 100% of user Java code');
assert(fallbackDoc.languages.python.code.includes('AlgoSync History -> Retry'), 'Fallback documentation provides clean instruction for other languages');
assert(fallbackDoc.languages.python.code.includes('def solve():'), 'Fallback documentation provides Python code structure');
assert(fallbackDoc.languages.cpp.code.includes('int main()'), 'Fallback documentation provides C++ code structure');
assert(fallbackDoc.languages.rust.code.includes('fn main()'), 'Fallback documentation provides Rust code structure');

const fallbackRendered = TemplateRenderer.render({
  problem: testProblem,
  aiAnalysis: fallbackDoc.approach,
  testCases: fallbackDoc.testCases,
  languages: fallbackDoc.languages,
  motivation: fallbackDoc.motivation
}, 'md');

assert(fallbackRendered.includes('# A. Min Max Game'), 'Fallback Markdown renders problem title');
assert(fallbackRendered.includes('public class Solution'), 'Fallback Markdown renders original Java code');

// 11. Test Active Submission Intent in Content Scripts
console.log('\n[11] Testing Active Submission Intent in Content Scripts...');
const hrScript = fs.readFileSync('content-scripts/hackerrank.js', 'utf8');
const lcScript = fs.readFileSync('content-scripts/leetcode.js', 'utf8');
const gfgScript = fs.readFileSync('content-scripts/geeksforgeeks.js', 'utf8');
const cfScript = fs.readFileSync('content-scripts/codeforces.js', 'utf8');
const ccScript = fs.readFileSync('content-scripts/codechef.js', 'utf8');
const heScript = fs.readFileSync('content-scripts/hackerearth.js', 'utf8');

assert(!hrScript.includes('checkHackerRankVerdict();\n\n  // Dual-layer'), 'HackerRank does not call checkHackerRankVerdict on page load');
assert(hrScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'HackerRank strictly guards verdict checks with userSubmittedAt');
assert(lcScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'LeetCode strictly guards verdict checks with userSubmittedAt');
assert(gfgScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'GeeksforGeeks strictly guards verdict checks with userSubmittedAt');
assert(cfScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'Codeforces strictly guards verdict checks with userSubmittedAt');
assert(ccScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'CodeChef strictly guards verdict checks with userSubmittedAt');
assert(heScript.includes('if (!userSubmittedAt || (now - userSubmittedAt > 60000))'), 'HackerEarth strictly guards verdict checks with userSubmittedAt');

// 12. Test SyncOrchestrator Historical Duplicate Suppression
console.log('\n[12] Testing Historical Duplicate Suppression...');
const orchestratorCode = fs.readFileSync('src/orchestrator/syncOrchestrator.js', 'utf8');
assert(orchestratorCode.includes('ALREADY_SYNCED'), 'SyncOrchestrator handles ALREADY_SYNCED status');
assert(orchestratorCode.includes('alreadySynced'), 'SyncOrchestrator checks history for identical submissions');

// 13. Test History Refresh Button
console.log('\n[13] Testing History Refresh Button...');
const optionsHtml = fs.readFileSync('options/options.html', 'utf8');
const optionsJs = fs.readFileSync('options/options.js', 'utf8');
assert(optionsHtml.includes('id="btn-refresh-history"'), 'options.html includes btn-refresh-history button');
assert(optionsHtml.includes('id="btn-export-history"'), 'options.html includes btn-export-history button');
assert(optionsJs.includes('btnRefreshHistory?.addEventListener'), 'options.js attaches refresh click listener');
assert(optionsJs.includes('await loadHistory()'), 'options.js reloads history data asynchronously');
assert(!optionsJs.includes('btnRefreshHistory?.addEventListener(\'click\', () => location.reload()'), 'options.js does not reload the entire page');

// 14. Test Codeforces Cross-Page Persistence & Status Table Parsing
console.log('\n[14] Testing Codeforces Cross-Page Persistence & Status Table Support...');
const cfFullScript = fs.readFileSync('content-scripts/codeforces.js', 'utf8');
const manifestObj = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const cfManifest = manifestObj.content_scripts.find(cs => cs.js.includes('content-scripts/codeforces.js'));

assert(cfManifest.matches.includes('*://*.codeforces.com/*'), 'Manifest matches all Codeforces subdomains and routes');
assert(cfFullScript.includes('sessionStorage.setItem(CF_PENDING_KEY'), 'Codeforces persists submission intent to sessionStorage before page navigation');
assert(cfFullScript.includes('sessionStorage.getItem(CF_PENDING_KEY'), 'Codeforces restores submission intent from sessionStorage after page redirect');
assert(cfFullScript.includes('table.status-frame-datatable'), 'Codeforces inspects status table for async verdict resolution');
assert(cfFullScript.includes('startPollingForVerdict'), 'Codeforces uses active polling for async verdict evaluation');
assert(cfFullScript.includes('lastProcessedSubmissionId'), 'Codeforces tracks last processed submission ID to prevent re-syncing');
assert(cfFullScript.includes('if (isStillRunning) {\n        return false;'), 'Codeforces waits if newest submission is still running and never falls through to older rows');
assert(cfFullScript.includes('fetchSubmissionSourceCode'), 'Codeforces fetches authentic source code for exact submission ID');


console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);

