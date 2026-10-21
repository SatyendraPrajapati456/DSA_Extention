/**
 * AI Service with Multi-Provider Abstraction
 * Supports Google Gemini, OpenAI, Groq, and Custom (OpenAI-compatible) endpoints.
 * Enforces structured output, schema validation, and language idiomatic requirements.
 */

import { AI_PROVIDERS } from '../constants/defaultSettings.js';
import { normalizeTopics } from '../constants/topics.js';

export class AIService {
  /**
   * Generates structured problem documentation
   * @param {Object} options 
   * @param {Object} options.settings - AI config settings
   * @param {Object} options.problem - Problem info { title, url, description, platform, originalLanguage, originalCode }
   * @param {string[]} [options.targetLanguages] - Array of language keys e.g. ['java', 'python', 'cpp', 'rust']
   * @returns {Promise<Object>} Validated structured documentation
   */
  static async generateDocumentation({ settings, problem, targetLanguages = ['java', 'python', 'cpp', 'rust'] }) {
    const { provider, apiKey, model, customEndpoint, temperature = 0.2 } = settings;

    if (!apiKey && provider !== AI_PROVIDERS.CUSTOM) {
      throw new Error(`API Key for ${provider.toUpperCase()} is not configured. Please set it in AlgoSync Options.`);
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(problem, targetLanguages);

    let rawResponse = '';
    switch (provider) {
      case AI_PROVIDERS.GEMINI:
        rawResponse = await this.callGemini({ apiKey, model, temperature, systemPrompt, userPrompt });
        break;
      case AI_PROVIDERS.OPENAI:
        rawResponse = await this.callOpenAI({ apiKey, model, temperature, systemPrompt, userPrompt, endpoint: 'https://api.openai.com/v1' });
        break;
      case AI_PROVIDERS.GROQ:
        rawResponse = await this.callOpenAI({ apiKey, model, temperature, systemPrompt, userPrompt, endpoint: 'https://api.groq.com/openai/v1' });
        break;
      case AI_PROVIDERS.CUSTOM:
        rawResponse = await this.callOpenAI({ apiKey: apiKey || 'none', model, temperature, systemPrompt, userPrompt, endpoint: customEndpoint || 'http://localhost:11434/v1' });
        break;
      default:
        throw new Error(`Unsupported AI Provider: ${provider}`);
    }

    const parsed = this.parseAndValidateResponse(rawResponse, problem, targetLanguages);
    return parsed;
  }

  /**
   * Builds the system instruction prompt
   */
  static buildSystemPrompt() {
    return `You are an elite Data Structures and Algorithms (DSA) educator, competitive programmer, and multilingual software architect.
Your task is to analyze an accepted DSA problem submission and generate a comprehensive, highly accurate, structured documentation object in valid JSON format.

CRITICAL RULES:
1. Examine the user's ACTUAL accepted code and the problem description. Explain the REAL algorithm used in the user's submission, not an assumed or imaginary one.
2. If the user's submission uses a brute-force approach, accurately analyze it as brute-force with its true time/space complexity.
3. For language implementations (Java, Python, C++, Rust):
   - Provide complete, compilable, idiomatic code compatible with the platform's expected interface (e.g., class Solution for LeetCode, standalone I/O for Codeforces/CodeChef where applicable).
   - If the user already provided accepted code in that language, provide the other requested languages cleanly and idiomatically.
   - Do NOT emit markdown placeholders or truncated "TODO" comments.
4. Output MUST BE strictly valid JSON without preamble, markdown wrapping, or commentary outside the JSON.`;
  }

  /**
   * Builds the user prompt containing problem information
   */
  static buildUserPrompt(problem, targetLanguages) {
    return `Analyze this accepted DSA problem and generate structured documentation.

Problem Information:
- Platform: ${problem.platform}
- Title: ${problem.title}
- URL: ${problem.url}
- Submitted Language: ${problem.originalLanguage || 'Unknown'}
- Problem Description:
${problem.description ? problem.description.substring(0, 3000) : 'N/A'}

User's Original Accepted Code:
\`\`\`${problem.originalLanguage || 'text'}
${problem.originalCode ? problem.originalCode.substring(0, 4000) : '// Original code unavailable'}
\`\`\`

Target Languages to generate solutions for: ${targetLanguages.join(', ')}

Return a single JSON object with EXACTLY this structure:
{
  "topics": ["Array", "Two Pointers"], // 1 to 4 appropriate DSA topics
  "approach": {
    "algorithm": "Name of primary algorithm (e.g. Hash Map / Two Pointers / Dynamic Programming)",
    "idea": "Concise summary of core idea and intuition",
    "steps": [
      "Step 1 description",
      "Step 2 description",
      "Step 3 description"
    ],
    "whyItWorks": "Explanation of mathematical or algorithmic correctness",
    "timeComplexity": "e.g. O(n) or O(n log n)",
    "auxiliarySpaceComplexity": "e.g. O(1) or O(n)"
  },
  "testCases": [
    {
      "name": "Standard Example / Edge Case 1",
      "input": "parameter representations",
      "expectedOutput": "expected return",
      "explanation": "Why this output is produced"
    },
    {
      "name": "Edge Case 2",
      "input": "...",
      "expectedOutput": "...",
      "explanation": "..."
    },
    {
      "name": "Constraint Boundary",
      "input": "...",
      "expectedOutput": "...",
      "explanation": "..."
    }
  ],
  "languages": {
    "java": {
      "whatIsRequired": [
        "1. Required data structure or collection in Java",
        "2. Traversal or lookup mechanism",
        "3. Method signature return"
      ],
      "importantConcepts": ["Arrays", "HashMap", "Time Complexity"],
      "code": "// Complete compilable Java solution"
    },
    "python": {
      "whatIsRequired": [
        "1. List or dict representations",
        "2. Pythonic iteration",
        "3. Return signature"
      ],
      "importantConcepts": ["Lists", "Dictionaries", "In-place modification"],
      "code": "# Complete compilable Python solution"
    },
    "cpp": {
      "whatIsRequired": [
        "1. Vectors / maps in C++ STL",
        "2. Iterators and indexing",
        "3. Proper signature"
      ],
      "importantConcepts": ["std::vector", "std::unordered_map", "Complexity"],
      "code": "// Complete compilable C++ solution"
    },
    "rust": {
      "whatIsRequired": [
        "1. Vec / HashMap representations",
        "2. Ownership and borrowing",
        "3. Return types"
      ],
      "importantConcepts": ["Vec", "HashMap", "Ownership", "Pattern Matching"],
      "code": "// Complete compilable Rust solution"
    }
  },
  "motivation": "Inspiring programming quote relevant to mastery and persistence."
}`;
  }

  /**
   * Calls Google Gemini API with automatic retry and fallback on 503/429 errors
   */
  static async callGemini({ apiKey, model, temperature, systemPrompt, userPrompt }) {
    const primaryModel = model || 'gemini-2.5-flash';
    // Fallback list to survive high-demand temporary outages (503 / 429)
    const modelsToTry = [primaryModel];
    if (primaryModel !== 'gemini-2.5-flash') modelsToTry.push('gemini-2.5-flash');
    if (primaryModel !== 'gemini-1.5-flash') modelsToTry.push('gemini-1.5-flash');

    let lastError = null;

    for (const currentModel of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

      const requestBody = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: temperature || 0.2,
          responseMimeType: 'application/json'
        }
      };

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || response.statusText;

            // If 503 (high demand) or 429 (rate limit), pause and retry
            if ((response.status === 503 || response.status === 429) && attempt === 1) {
              console.warn(`[AlgoSync] Gemini (${currentModel}) returned ${response.status}. Retrying in 1.5s...`);
              await new Promise(r => setTimeout(r, 1500));
              continue;
            }

            throw new Error(`Gemini API Error (${response.status}): ${errMsg}`);
          }

          const data = await response.json();
          const candidate = data.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;

          if (!text) {
            throw new Error('Gemini API returned an empty response.');
          }

          return text;

        } catch (err) {
          lastError = err;
          // If error is 503 / 429 and attempt 1, try again
          if (attempt === 1 && (err.message.includes('503') || err.message.includes('429'))) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          // Otherwise try next model in fallback list
          break;
        }
      }
    }

    throw lastError || new Error('Gemini API call failed after retries.');
  }

  /**
   * Calls OpenAI / Groq / OpenAI-compatible API
   */
  static async callOpenAI({ apiKey, model, temperature, systemPrompt, userPrompt, endpoint }) {
    const baseEndpoint = endpoint.replace(/\/+$/, '');
    const url = `${baseEndpoint}/chat/completions`;

    const requestBody = {
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature || 0.2,
      response_format: { type: 'json_object' }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`AI Provider API Error (${response.status}): ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('AI Provider returned an empty response.');
    }

    return text;
  }

  /**
   * Parses and validates the raw JSON response against schema requirements
   */
  static parseAndValidateResponse(rawText, problem, targetLanguages) {
    // Clean potential markdown fencing ```json ... ```
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Attempt regex extraction of first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (innerErr) {
          throw new Error(`Failed to parse AI response as JSON: ${innerErr.message}`);
        }
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
      }
    }

    // Validate core fields
    if (!parsed.approach || typeof parsed.approach !== 'object') {
      parsed.approach = {
        algorithm: 'Optimal Algorithm',
        idea: 'Solves the problem using accepted platform submission.',
        steps: ['Process input', 'Execute algorithm', 'Return result'],
        whyItWorks: 'Correctly implements the constraints and states.',
        timeComplexity: 'O(n)',
        auxiliarySpaceComplexity: 'O(1)'
      };
    }

    // Standardize topics
    parsed.topics = normalizeTopics(parsed.topics || []);

    // Validate test cases
    if (!Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
      parsed.testCases = [
        {
          name: 'Standard Example 1',
          input: 'Refer to problem description',
          expectedOutput: 'Refer to problem description',
          explanation: 'Standard test case verified on platform.'
        }
      ];
    }

    // Validate language solutions
    if (!parsed.languages || typeof parsed.languages !== 'object') {
      parsed.languages = {};
    }

    for (const langKey of targetLanguages) {
      if (!parsed.languages[langKey]) {
        parsed.languages[langKey] = {
          whatIsRequired: [`1. Standard ${langKey} solution framework.`],
          importantConcepts: [`${langKey.toUpperCase()} Data Structures`],
          code: `// ${langKey.toUpperCase()} implementation`
        };
      }
    }

    return parsed;
  }
}
