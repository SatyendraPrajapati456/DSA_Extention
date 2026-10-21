/**
 * Default Settings and System Constants
 */

export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
  GROQ: 'groq',
  CUSTOM: 'custom'
};

export const AI_MODELS = {
  [AI_PROVIDERS.GEMINI]: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Latest & Recommended)' },
    { id: 'gemini-3.8-pro', name: 'Gemini 3.8 Pro (Deep Reasoning & Complex DSA)' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (High Speed)' },
    { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fast & Accurate)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep Reasoning)' }
  ],
  [AI_PROVIDERS.OPENAI]: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost Effective)' },
    { id: 'gpt-4o', name: 'GPT-4o (High Intelligence)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
  ],
  [AI_PROVIDERS.GROQ]: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Ultra Fast)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
  ],
  [AI_PROVIDERS.CUSTOM]: [
    { id: 'custom-model', name: 'Custom OpenAI-Compatible Model' }
  ]
};

export const SUPPORTED_PLATFORMS = {
  LEETCODE: {
    id: 'leetcode',
    name: 'LeetCode',
    defaultSubfolder: 'LeetCode',
    domain: 'leetcode.com',
    color: '#FFA116',
    icon: 'code'
  },
  GEEKSFORGEEKS: {
    id: 'geeksforgeeks',
    name: 'GeeksforGeeks',
    defaultSubfolder: 'GFG',
    domain: 'geeksforgeeks.org',
    color: '#2F8D46',
    icon: 'terminal'
  },
  CODEFORCES: {
    id: 'codeforces',
    name: 'Codeforces',
    defaultSubfolder: 'Codeforces',
    domain: 'codeforces.com',
    color: '#1F8ACB',
    icon: 'cpu'
  },
  CODECHEF: {
    id: 'codechef',
    name: 'CodeChef',
    defaultSubfolder: 'CodeChef',
    domain: 'codechef.com',
    color: '#5B4638',
    icon: 'coffee'
  },
  HACKERRANK: {
    id: 'hackerrank',
    name: 'HackerRank',
    defaultSubfolder: 'HackerRank',
    domain: 'hackerrank.com',
    color: '#00EA64',
    icon: 'award'
  },
  HACKEREARTH: {
    id: 'hackerearth',
    name: 'HackerEarth',
    defaultSubfolder: 'HackerEarth',
    domain: 'hackerearth.com',
    color: '#323754',
    icon: 'globe'
  }
};

/**
 * Computes default platform folder paths based on a given root folder
 * @param {string} rootFolder e.g. "DSA" or "CompetitiveProgramming" or ""
 * @returns {Object} { leetcode: "DSA/LeetCode", geeksforgeeks: "DSA/GFG", ... }
 */
export function getDefaultPlatformPaths(rootFolder = 'DSA') {
  const cleanRoot = (rootFolder || '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = cleanRoot ? `${cleanRoot}/` : '';

  return {
    leetcode: `${prefix}LeetCode`,
    geeksforgeeks: `${prefix}GFG`,
    codeforces: `${prefix}Codeforces`,
    codechef: `${prefix}CodeChef`,
    hackerrank: `${prefix}HackerRank`,
    hackerearth: `${prefix}HackerEarth`
  };
}

export const TARGET_LANGUAGES = [
  { id: 'java', name: 'Java', extension: 'java' },
  { id: 'python', name: 'Python', extension: 'py' },
  { id: 'cpp', name: 'C++', extension: 'cpp' },
  { id: 'rust', name: 'Rust', extension: 'rs' }
];

export const MOTIVATIONAL_QUOTES = [
  'Every problem you solve strengthens the way you think.',
  'Mastery is built through consistency, one algorithm at a time.',
  'Great coders aren’t born; they are forged in edge cases and debugging.',
  'Understanding the problem is half of the algorithm.',
  'Small daily improvements over time lead to stunning algorithmic mastery.',
  'Consistency turns difficult problems into familiar patterns.',
  'Every solved problem strengthens your problem-solving foundation.',
  'Learn the pattern, understand the logic, and keep improving.',
  'Data structures organize data; algorithms breathe life into them.',
  'Consistency transforms struggle into intuition.'
];

export const DEFAULT_SETTINGS = {
  // GitHub Configuration
  github: {
    pat: '',
    username: '',
    repoName: 'DSA',
    repoOwner: '',
    branch: 'main',
    rootFolder: 'DSA',
    platformPaths: getDefaultPlatformPaths('DSA'),
    includeTopicSubfolder: false, // If true: {platformPath}/{topic}/{title}.md, if false: {platformPath}/{title}.md
    fileFormat: 'md', // 'md' (default) or 'txt'
    isConnected: false
  },

  // AI Configuration
  ai: {
    provider: AI_PROVIDERS.GEMINI,
    apiKey: '',
    apiKeys: [],
    model: 'gemini-3.8-flash',
    customEndpoint: 'http://localhost:11434/v1',
    temperature: 0.2,
    languages: ['java', 'python', 'cpp', 'rust']
  },

  // Enabled Platforms
  platforms: {
    leetcode: true,
    geeksforgeeks: true,
    codeforces: true,
    codechef: true,
    hackerrank: true,
    hackerearth: true
  },

  // Automation Preferences
  syncPreferences: {
    autoSyncOnAccept: true,
    showNotifications: true,
    retryFailedSyncs: true,
    includeSubmissionStats: true
  }
};
