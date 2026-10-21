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

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
