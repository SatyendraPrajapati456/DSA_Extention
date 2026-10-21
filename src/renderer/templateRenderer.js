/**
 * Template Renderer
 * Formats DSA problem solutions, AI analysis, test cases, and multilingual
 * implementations into Markdown (.md) [Recommended] or Plain Text (.txt)
 * strictly following project specifications.
 */

import { MOTIVATIONAL_QUOTES } from '../constants/defaultSettings.js';

export class TemplateRenderer {
  /**
   * Sanitizes a problem title into a safe filename
   * @param {string} title 
   * @returns {string} Sanitized filename without extension
   */
  static sanitizeFilename(title) {
    if (!title) return 'Problem';
    return title
      .trim()
      .replace(/[\\/*?:"<>|]/g, '') // remove illegal filesystem chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Renders the document in either Markdown (.md) or Plain Text (.txt) format
   * @param {Object} data 
   * @param {'md'|'txt'} [format='md'] 
   * @returns {string} Formatted problem document
   */
  static render(data, format = 'md') {
    if (format === 'txt') {
      return this.renderPlainText(data);
    }
    return this.renderMarkdown(data);
  }

  /**
   * Renders standardized Markdown document (.md) matching Section 8 & 9
   */
  static renderMarkdown(data) {
    const { problem, aiAnalysis, testCases = [], languages = {}, motivation } = data;
    const lines = [];

    // Title
    lines.push(`# ${problem.title || 'Problem'}`);
    lines.push('');

    // ## 1. Problem Details
    lines.push('## 1. Problem Details');
    lines.push('');
    lines.push(`**Platform:** ${problem.platform || 'Competitive Programming'}`);
    lines.push('');
    lines.push('**Question Link:**');
    lines.push(problem.url || 'N/A');
    lines.push('');
    lines.push(`**Question Name:** ${problem.title || 'Untitled'}`);
    lines.push('');
    lines.push('**Question Description:**');
    lines.push('');
    lines.push((problem.description || 'Description not available. Refer to the question link.').trim());
    lines.push('');

    // ## 2. Test Cases
    lines.push('## 2. Test Cases');
    lines.push('');
    if (testCases && testCases.length > 0) {
      testCases.forEach((tc, idx) => {
        const title = tc.name ? `### Test Case ${idx + 1}: ${tc.name}` : `### Test Case ${idx + 1}`;
        lines.push(title);
        lines.push('');
        lines.push('Input:');
        lines.push('```text');
        lines.push(tc.input ? String(tc.input).trim() : 'N/A');
        lines.push('```');
        lines.push('');
        lines.push('Output:');
        lines.push('```text');
        lines.push(tc.expectedOutput ? String(tc.expectedOutput).trim() : 'N/A');
        lines.push('```');
        lines.push('');
        if (tc.explanation) {
          lines.push('Explanation:');
          lines.push(String(tc.explanation).trim());
          lines.push('');
        }
      });
    } else {
      lines.push('Standard test cases verified on the coding platform.');
      lines.push('');
    }

    // ## 3. AI-Generated Approach
    const approach = aiAnalysis || {};
    lines.push('## 3. AI-Generated Approach');
    lines.push('');
    lines.push(`### Approach: ${approach.algorithm || 'Optimal Algorithm'}`);
    lines.push('');
    lines.push(approach.idea || 'Analyze the constraints and state transitions to arrive at the solution.');
    lines.push('');

    if (approach.steps && Array.isArray(approach.steps) && approach.steps.length > 0) {
      lines.push('**Step-by-Step Reasoning:**');
      approach.steps.forEach((step, i) => {
        lines.push(`${i + 1}. ${step}`);
      });
      lines.push('');
    }

    if (approach.whyItWorks) {
      lines.push('**Why It Works:**');
      lines.push(approach.whyItWorks);
      lines.push('');
    }

    lines.push('### Time Complexity');
    lines.push('');
    lines.push(approach.timeComplexity || 'O(n)');
    lines.push('');

    lines.push('### Space Complexity');
    lines.push('');
    lines.push(approach.auxiliarySpaceComplexity || approach.spaceComplexity || 'O(1)');
    lines.push('');

    // Language Solutions: Java, Python, C++, Rust
    const standardLangs = [
      { key: 'java', sectionNum: 4, name: 'Java', fence: 'java' },
      { key: 'python', sectionNum: 5, name: 'Python', fence: 'python' },
      { key: 'cpp', sectionNum: 6, name: 'C++', fence: 'cpp' },
      { key: 'rust', sectionNum: 7, name: 'Rust', fence: 'rust' }
    ];

    const origLangKey = (problem.originalLanguage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isStandard = ['java', 'python', 'py', 'python3', 'cpp', 'c++', 'rust', 'rs'].includes(origLangKey);

    standardLangs.forEach(langDef => {
      const langData = languages[langDef.key] || {};
      const isOriginalSubmission = this.matchesLanguage(problem.originalLanguage, langDef.key);

      lines.push(`## ${langDef.sectionNum}. ${langDef.name} Solution`);
      lines.push('');
      lines.push('### Required Concepts');
      lines.push('');

      const concepts = langData.importantConcepts || langData.whatIsRequired || ['Arrays', 'Time Complexity'];
      if (Array.isArray(concepts)) {
        concepts.forEach(c => lines.push(`- ${c.replace(/^\d+\.\s*/, '')}`));
      } else {
        lines.push(`- ${concepts}`);
      }
      lines.push('');

      if (isOriginalSubmission && problem.originalCode) {
        lines.push('### Original Accepted Submission');
        lines.push('');
        lines.push(`\`\`\`${langDef.fence}`);
        lines.push(problem.originalCode.trim());
        lines.push('```');
        lines.push('');

        if (langData.code && langData.code.trim() !== problem.originalCode.trim()) {
          lines.push(`### AI-Generated ${langDef.name} Alternative`);
          lines.push('');
          lines.push(`\`\`\`${langDef.fence}`);
          lines.push(langData.code.trim());
          lines.push('```');
          lines.push('');
        }
      } else {
        lines.push(`### AI-Generated ${langDef.name} Implementation`);
        lines.push('');
        lines.push(`\`\`\`${langDef.fence}`);
        lines.push(langData.code ? langData.code.trim() : `// ${langDef.name} implementation`);
        lines.push('```');
        lines.push('');
      }
    });

    // If original submission is outside standard 4 languages (e.g. JavaScript, Go, Kotlin)
    if (!isStandard && problem.originalLanguage && problem.originalCode) {
      lines.push(`## Original ${problem.originalLanguage} Accepted Submission`);
      lines.push('');
      lines.push('### Preserved User Submission');
      lines.push('');
      lines.push(`\`\`\`${origLangKey || 'text'}`);
      lines.push(problem.originalCode.trim());
      lines.push('```');
      lines.push('');
    }

    // ## 8. Motivation
    const quote = motivation || MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    lines.push('## 8. Motivation');
    lines.push('');
    lines.push(`> "${quote}"`);
    lines.push('');

    // Centered Thank You Closing
    lines.push('<div align="center">');
    lines.push('');
    lines.push('## Thank You 🚀');
    lines.push('');
    lines.push('</div>');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Renders standardized Plain Text document (.txt) matching Section 6
   */
  static renderPlainText(data) {
    const { problem, aiAnalysis, testCases = [], languages = {}, motivation } = data;
    const parts = [];

    const divider = '============================================================';

    parts.push(divider);
    parts.push('PROBLEM DETAILS');
    parts.push(divider);
    parts.push('');
    parts.push(`URL: ${problem.url || 'N/A'}`);
    parts.push('');
    parts.push(`Question Name: ${problem.title || 'Untitled Problem'}`);
    parts.push('');
    parts.push('Question Description:');
    parts.push('');
    parts.push((problem.description || 'Description not available. Refer to the problem URL.').trim());
    parts.push('');

    parts.push(divider);
    parts.push('TEST CASES');
    parts.push(divider);
    parts.push('');

    if (testCases && testCases.length > 0) {
      testCases.forEach((tc, idx) => {
        const title = tc.name ? `Test Case ${idx + 1}: ${tc.name}` : `Test Case ${idx + 1}`;
        parts.push(title);
        parts.push('');
        parts.push('Input:');
        parts.push(tc.input ? String(tc.input).trim() : 'N/A');
        parts.push('');
        parts.push('Expected Output:');
        parts.push(tc.expectedOutput ? String(tc.expectedOutput).trim() : 'N/A');
        parts.push('');
        if (tc.explanation) {
          parts.push('Explanation:');
          parts.push(String(tc.explanation).trim());
          parts.push('');
        }
        if (idx < testCases.length - 1) parts.push('');
      });
    }

    parts.push(divider);
    parts.push('APPROACH');
    parts.push(divider);
    parts.push('');

    const approach = aiAnalysis || {};
    parts.push('Algorithm:');
    parts.push(approach.algorithm || 'Optimized Algorithm');
    parts.push('');
    parts.push('Idea:');
    parts.push(approach.idea || 'Analyze the constraints and state transitions to arrive at the solution.');
    parts.push('');

    if (approach.steps && Array.isArray(approach.steps) && approach.steps.length > 0) {
      parts.push('Steps:');
      approach.steps.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
      parts.push('');
    }

    parts.push('Why It Works:');
    parts.push(approach.whyItWorks || 'Leverages optimal substructure.');
    parts.push('');
    parts.push('Time Complexity:');
    parts.push(approach.timeComplexity || 'O(n)');
    parts.push('');
    parts.push('Auxiliary Space Complexity:');
    parts.push(approach.auxiliarySpaceComplexity || approach.spaceComplexity || 'O(1)');
    parts.push('');

    const standardLangs = [
      { key: 'java', label: 'JAVA SOLUTION', name: 'Java' },
      { key: 'python', label: 'PYTHON SOLUTION', name: 'Python' },
      { key: 'cpp', label: 'C++ SOLUTION', name: 'C++' },
      { key: 'rust', label: 'RUST SOLUTION', name: 'Rust' }
    ];

    standardLangs.forEach(langDef => {
      const langData = languages[langDef.key] || {};
      const isOriginalSubmission = this.matchesLanguage(problem.originalLanguage, langDef.key);

      parts.push(divider);
      parts.push(langDef.label);
      parts.push(divider);
      parts.push('');
      parts.push(`What Is Required to Solve This Question in ${langDef.name}?`);
      parts.push('');

      const reqs = langData.whatIsRequired || ['1. Standard data structures.', '2. Proper algorithm logic.'];
      reqs.forEach((r, i) => {
        const prefix = /^\d+\./.test(r.trim()) ? '' : `${i + 1}. `;
        parts.push(`${prefix}${r}`);
      });
      parts.push('');

      parts.push('Important Concepts:');
      const concepts = langData.importantConcepts || ['Data Structures', 'Time Complexity'];
      concepts.forEach(c => parts.push(`- ${c}`));
      parts.push('');

      parts.push('Code:');
      if (isOriginalSubmission && problem.originalCode) {
        parts.push('// [ORIGINAL ACCEPTED SUBMISSION - User Submitted]');
        parts.push(problem.originalCode.trim());
      } else if (langData.code) {
        parts.push('// [AI-GENERATED ALTERNATIVE SOLUTION]');
        parts.push(langData.code.trim());
      } else {
        parts.push('// Solution code not available.');
      }
      parts.push('');
    });

    const quote = motivation || MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    parts.push(divider);
    parts.push('MOTIVATION');
    parts.push(divider);
    parts.push('');
    parts.push(`"${quote}"`);
    parts.push('');

    parts.push(divider);
    parts.push('THANK YOU');
    parts.push(divider);
    parts.push('');
    parts.push(this.centerText('Thank You! 🚀'));
    parts.push('');
    parts.push(divider);

    return parts.join('\n');
  }

  static centerText(text, width = 60) {
    const textLen = text.length;
    if (textLen >= width) return text;
    const leftPad = Math.floor((width - textLen) / 2);
    return ' '.repeat(leftPad) + text;
  }

  static matchesLanguage(subLang = '', targetKey = '') {
    const s = subLang.toLowerCase();
    const t = targetKey.toLowerCase();
    if (t === 'java') return s.includes('java') && !s.includes('script');
    if (t === 'python') return s.includes('python') || s === 'py';
    if (t === 'cpp') return s.includes('c++') || s.includes('cpp') || s === 'c';
    if (t === 'rust') return s.includes('rust') || s === 'rs';
    return false;
  }
}
