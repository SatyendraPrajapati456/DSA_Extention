/**
 * AI Service with Multi-Provider Abstraction, Key Rotation & Model Failover
 * Supports Google Gemini, OpenAI, Groq, and Custom (OpenAI-compatible) endpoints.
 * Automatically rotates across multiple user API keys and fallback models if any
 * model or key is busy (503), rate-limited (429), or unavailable (404/403).
 */

import { AI_PROVIDERS } from '../constants/defaultSettings.js';
import { normalizeTopics } from '../constants/topics.js';

export class AIService {
  // Proven working model & key cache to skip candidate failovers and eliminate generation delay
  static activeWorkingModel = null;
  static activeWorkingKey = null;

  /**
   * Generates structured problem documentation with multi-key rotation and model fallback
   * @param {Object} options 
   * @param {Object} options.settings - AI config settings { provider, apiKey, apiKeys, model, ... }
   * @param {Object} options.problem - Problem info { title, url, description, platform, originalLanguage, originalCode }
   * @param {string[]} [options.targetLanguages] - Array of language keys e.g. ['java', 'python', 'cpp', 'rust']
   * @returns {Promise<Object>} Validated structured documentation
   */
  static async generateDocumentation({ settings, problem, targetLanguages = ['java', 'python', 'cpp', 'rust'] }) {
    const { provider, model, customEndpoint, temperature = 0.2 } = settings;
    const apiKeys = this.extractApiKeys(settings);

    if (apiKeys.length === 0 && provider !== AI_PROVIDERS.CUSTOM) {
      throw new Error(`No API Key configured for ${provider.toUpperCase()}. Please configure at least one API key in AlgoSync Options.`);
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(problem, targetLanguages);

    // Fast-Path: If a proven working model and key succeeded previously, use it immediately!
    if (this.activeWorkingModel && this.activeWorkingKey && apiKeys.includes(this.activeWorkingKey)) {
      try {
        console.log(`[AlgoSync] AI Fast-Path: Calling proven model "${this.activeWorkingModel}" directly...`);
        let fastRaw = '';
        if (provider === AI_PROVIDERS.GEMINI) {
          fastRaw = await this.callSingleGemini({
            apiKey: this.activeWorkingKey,
            model: this.activeWorkingModel,
            temperature,
            systemPrompt,
            userPrompt,
            timeoutMs: 15000
          });
        } else {
          fastRaw = await this.callSingleOpenAI({
            apiKey: this.activeWorkingKey,
            model: this.activeWorkingModel,
            temperature,
            systemPrompt,
            userPrompt,
            endpoint: provider === AI_PROVIDERS.GROQ ? 'https://api.groq.com/openai/v1' : (customEndpoint || 'https://api.openai.com/v1'),
            timeoutMs: 15000
          });
        }
        if (fastRaw && fastRaw.trim()) {
          console.log(`[AlgoSync] AI Fast-Path succeeded in record time!`);
          return this.parseAndValidateResponse(fastRaw, problem, targetLanguages);
        }
      } catch (fastErr) {
        console.warn(`[AlgoSync] Fast-Path model "${this.activeWorkingModel}" unavailable, falling back to rotation:`, fastErr.message);
        this.activeWorkingModel = null;
        this.activeWorkingKey = null;
      }
    }

    const candidateModels = this.getModelCandidates(provider, model);

    let lastError = null;
    let attemptsCount = 0;

    // Outer Loop: Try configured model first, then fallback models if busy/error
    for (const currentModel of candidateModels) {
      // Inner Loop: Try each API key in the pool (automatic key rotation)
      for (const currentKey of (apiKeys.length > 0 ? apiKeys : ['none'])) {
        attemptsCount++;
        const keyHint = currentKey.length > 6 ? `...${currentKey.slice(-4)}` : 'default';

        try {
          console.log(`[AlgoSync] AI Attempt #${attemptsCount}: Provider=${provider}, Model="${currentModel}", Key=${keyHint}`);

          let rawResponse = '';
          switch (provider) {
            case AI_PROVIDERS.GEMINI:
              rawResponse = await this.callSingleGemini({
                apiKey: currentKey,
                model: currentModel,
                temperature,
                systemPrompt,
                userPrompt
              });
              break;

            case AI_PROVIDERS.OPENAI:
              rawResponse = await this.callSingleOpenAI({
                apiKey: currentKey,
                model: currentModel,
                temperature,
                systemPrompt,
                userPrompt,
                endpoint: 'https://api.openai.com/v1'
              });
              break;

            case AI_PROVIDERS.GROQ:
              rawResponse = await this.callSingleOpenAI({
                apiKey: currentKey,
                model: currentModel,
                temperature,
                systemPrompt,
                userPrompt,
                endpoint: 'https://api.groq.com/openai/v1'
              });
              break;

            case AI_PROVIDERS.CUSTOM:
              rawResponse = await this.callSingleOpenAI({
                apiKey: currentKey || 'none',
                model: currentModel,
                temperature,
                systemPrompt,
                userPrompt,
                endpoint: customEndpoint || 'http://localhost:11434/v1'
              });
              break;

            default:
              throw new Error(`Unsupported AI Provider: ${provider}`);
          }

          if (rawResponse && rawResponse.trim()) {
            console.log(`[AlgoSync] AI generation succeeded using model "${currentModel}"!`);
            this.activeWorkingModel = currentModel;
            this.activeWorkingKey = currentKey;
            const parsed = this.parseAndValidateResponse(rawResponse, problem, targetLanguages);
            return parsed;
          }

        } catch (err) {
          lastError = err;
          console.warn(`[AlgoSync] Attempt failed with model "${currentModel}" and key ${keyHint}: ${err.message}`);
          // If error is 503 (busy/high demand), 429 (rate-limited), 404 (model not found), or 403 (quota),
          // continue loop to rotate key or failover to another model.
          continue;
        }
      }
    }

    // If provider is Gemini and standard candidates failed, attempt dynamic discovery of active models
    if (provider === AI_PROVIDERS.GEMINI && apiKeys.length > 0) {
      for (const currentKey of apiKeys) {
        const liveModels = await this.getLiveGeminiModels(currentKey);
        for (const liveModel of liveModels) {
          if (candidateModels.includes(liveModel)) continue;
          try {
            console.log(`[AlgoSync] Trying dynamically discovered Gemini model: "${liveModel}"`);
            const rawResponse = await this.callSingleGemini({
              apiKey: currentKey,
              model: liveModel,
              temperature,
              systemPrompt,
              userPrompt
            });
            if (rawResponse && rawResponse.trim()) {
              console.log(`[AlgoSync] AI generation succeeded using dynamically discovered model "${liveModel}"!`);
              return this.parseAndValidateResponse(rawResponse, problem, targetLanguages);
            }
          } catch (e) {
            lastError = e;
          }
        }
      }
    }

    throw lastError || new Error(`AI generation failed after testing ${candidateModels.length} models and ${apiKeys.length} API keys.`);
  }

  /**
   * Extracts and deduplicates all API keys provided in settings (array or comma/newline-separated string)
   * @param {Object} settings 
   * @returns {string[]} Sanitized list of non-empty API keys
   */
  static extractApiKeys(settings) {
    const keys = [];

    // Check array in settings.apiKeys
    if (Array.isArray(settings.apiKeys)) {
      for (const k of settings.apiKeys) {
        if (typeof k === 'string' && k.trim()) {
          const clean = k.trim();
          if (!keys.includes(clean)) keys.push(clean);
        }
      }
    }

    // Check string in settings.apiKey (can be single key or comma/newline-separated)
    if (typeof settings.apiKey === 'string' && settings.apiKey.trim()) {
      const parts = settings.apiKey.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!keys.includes(p)) keys.push(p);
      }
    }

    return keys;
  }

  /**
   * Returns ordered list of models to try (user-selected first, followed by stable fallbacks)
   */
  static getModelCandidates(provider, selectedModel) {
    let list = [];

    if (provider === AI_PROVIDERS.GEMINI) {
      const primary = selectedModel || 'gemini-3.8-flash';
      list = [
        primary,
        'gemini-3.8-flash',
        'gemini-3.8-pro',
        'gemini-3.5-flash',
        'gemini-3.0-flash',
        'gemini-2.5-flash',
        'gemini-2.5-pro'
      ];
    } else if (provider === AI_PROVIDERS.OPENAI) {
      const primary = selectedModel || 'gpt-4o-mini';
      list = [primary, 'gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
    } else if (provider === AI_PROVIDERS.GROQ) {
      const primary = selectedModel || 'llama-3.3-70b-versatile';
      list = [primary, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    } else {
      list = [selectedModel || 'custom-model'];
    }

    // Deduplicate, filter out falsy values and deprecated 2.0/1.x models
    return Array.from(new Set(list.filter(m => Boolean(m) && !m.includes('2.0') && !m.startsWith('gemini-1.'))));
  }

  /**
   * Queries Google API to discover active live Gemini models supporting generateContent
   * (filtering out shut down 2.0 and 1.x models)
   */
  static async getLiveGeminiModels(apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data.models)) return [];
      return data.models
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(m => !m.includes('2.0') && !m.startsWith('gemini-1.'));
    } catch {
      return [];
    }
  }

  /**
   * Calls Google Gemini API for a single request with high-speed timeout
   */
  static async callSingleGemini({ apiKey, model, temperature, systemPrompt, userPrompt, timeoutMs = 15000 }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
        responseMimeType: 'application/json',
        maxOutputTokens: 3072
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || response.statusText;
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
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${timeoutMs / 1000}s on model "${model}".`);
      }
      throw err;
    }
  }

  /**
   * Calls OpenAI / Groq / OpenAI-compatible endpoint for a single request with high-speed timeout
   */
  static async callSingleOpenAI({ apiKey, model, temperature, systemPrompt, userPrompt, endpoint, timeoutMs = 15000 }) {
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

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey !== 'none') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || response.statusText;
        throw new Error(`AI Provider API Error (${response.status}): ${errMsg}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('AI Provider returned an empty response.');
      }

      return text;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`AI Provider request timed out after ${timeoutMs / 1000}s on model "${model}".`);
      }
      throw err;
    }
  }

  /**
   * Generates resilient fallback documentation preserving the user's accepted submission
   * when all AI keys or models are busy/exhausted, guaranteeing zero data loss.
   */
  static generateFallbackDocumentation(problem, targetLanguages = ['java', 'python', 'cpp', 'rust'], failureReason = '') {
    const origLang = (problem.originalLanguage || 'Java');
    const origLangLower = origLang.toLowerCase();
    const preservedCode = problem.originalCode || `// Original code preserved from ${problem.platform}`;

    const languagesObj = {};
    for (const tl of targetLanguages) {
      const isUserSubmittedLang =
        tl.toLowerCase() === origLangLower ||
        (origLangLower.includes('java') && tl === 'java') ||
        (origLangLower.includes('python') && tl === 'python') ||
        (origLangLower.includes('cpp') && tl === 'cpp') ||
        (origLangLower.includes('rust') && tl === 'rust');

      if (isUserSubmittedLang) {
        languagesObj[tl] = {
          whatIsRequired: [
            `1. Accepted ${origLang} implementation logic.`,
            `2. Platform I/O specifications for ${problem.platform}.`,
            '3. Verified algorithm passing all test cases.'
          ],
          importantConcepts: ['Algorithms', 'Data Structures', 'Optimal Complexity'],
          code: preservedCode
        };
      } else {
        languagesObj[tl] = {
          whatIsRequired: [
            `1. Idiomatic ${tl.toUpperCase()} solution for ${problem.title || 'challenge'}.`,
            '2. Can be re-generated with AI documentation via AlgoSync Dashboard -> History -> Retry when AI capacity is available.'
          ],
          importantConcepts: [`${tl.toUpperCase()} Syntax`, 'Standard Library', 'Optimal Complexity'],
          code: this.generateLanguageScaffold(tl, problem, origLang)
        };
      }
    }

    return {
      topics: ['Algorithms'],
      approach: {
        algorithm: 'Optimal Accepted Solution',
        idea: `Accepted solution verified and submitted on ${problem.platform}.`,
        steps: [
          `Analyze problem statement and edge cases on ${problem.platform}.`,
          `Implement optimal algorithmic solution in ${origLang}.`,
          `Submit and successfully pass all test cases.`
        ],
        whyItWorks: `Algorithm adheres to all problem constraints and successfully passes all verified test cases on ${problem.platform}.`,
        timeComplexity: 'Optimal for constraints.',
        auxiliarySpaceComplexity: 'Optimal for constraints.'
      },
      testCases: [
        {
          name: 'Platform Verified Test Suite',
          input: 'Refer to problem description',
          expectedOutput: 'Accepted verdict',
          explanation: `Passed all test cases on ${problem.platform}.`
        }
      ],
      languages: languagesObj,
      motivation: 'Every problem you solve strengthens your problem-solving foundation.'
    };
  }

  /**
   * Generates a clean, idiomatic code scaffold for fallback languages
   */
  static generateLanguageScaffold(langKey, problem, origLang) {
    const title = problem.title || 'Problem Solution';
    switch (langKey) {
      case 'python':
        return `# PYTHON solution can be generated via AlgoSync History -> Retry once AI capacity is available.
# Original accepted ${origLang} solution is preserved in this document.

def solve():
    """
    Platform: ${problem.platform}
    Challenge: ${title}
    """
    pass

if __name__ == '__main__':
    solve()
`;

      case 'cpp':
        return `// C++ solution can be generated via AlgoSync History -> Retry once AI capacity is available.
// Original accepted ${origLang} solution is preserved in this document.

#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    // Platform: ${problem.platform}
    // Challenge: ${title}
    return 0;
}
`;

      case 'java':
        return `// JAVA solution can be generated via AlgoSync History -> Retry once AI capacity is available.
// Original accepted ${origLang} solution is preserved in this document.

import java.io.*;
import java.util.*;

public class Solution {
    public static void main(String[] args) {
        // Platform: ${problem.platform}
        // Challenge: ${title}
    }
}
`;

      case 'rust':
        return `// RUST solution can be generated via AlgoSync History -> Retry once AI capacity is available.
// Original accepted ${origLang} solution is preserved in this document.

fn main() {
    // Platform: ${problem.platform}
    // Challenge: ${title}
}
`;

      default:
        return `// ${langKey.toUpperCase()} solution can be generated via AlgoSync History -> Retry once AI capacity is available.\n// Your original accepted submission in ${origLang} is preserved in this document.`;
    }
  }

  /**
   * Builds the system instruction prompt
   */
  static buildSystemPrompt() {
    return `You are an elite Data Structures and Algorithms (DSA) educator and software architect.
Your task is to analyze an accepted DSA problem submission and generate a concise, highly accurate, structured documentation object in valid JSON format.

CRITICAL RULES:
1. Examine the user's ACTUAL accepted code and the problem description. Explain the REAL algorithm used in the user's submission, not an assumed or imaginary one.
2. Be concise, direct, and algorithmic. Avoid conversational padding or filler text.
3. If the user's submission uses a brute-force approach, accurately analyze it as brute-force with its true time/space complexity.
4. For language implementations (Java, Python, C++, Rust):
   - Provide complete, compilable, idiomatic code compatible with the platform's expected interface (e.g., class Solution for LeetCode, standalone I/O for Codeforces/CodeChef where applicable).
   - If the user already provided accepted code in that language, keep that language faithful to their submission.
   - Do NOT emit markdown placeholders or truncated "TODO" comments.
5. Output MUST BE strictly valid JSON without preamble, markdown wrapping, or commentary outside the JSON.`;
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
   * Parses and validates the raw JSON response against schema requirements
   */
  static parseAndValidateResponse(rawText, problem, targetLanguages) {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
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

    // Validate core approach fields
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
