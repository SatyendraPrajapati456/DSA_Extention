/**
 * DSA Topic Classification Taxonomy
 * Hierarchical topic definitions according to project specifications
 */

export const TOPIC_CATEGORIES = {
  FUNDAMENTALS: {
    name: 'Fundamentals',
    topics: [
      'Basic Programming',
      'Mathematics',
      'Number Theory',
      'Bit Manipulation',
      'Bit Magic'
    ]
  },
  LINEAR_DATA_STRUCTURES: {
    name: 'Linear Data Structures',
    topics: [
      'Arrays',
      'Strings',
      'Linked Lists',
      'Stacks',
      'Queues',
      'Deques',
      'Hashing'
    ]
  },
  SEARCHING_AND_OPTIMIZATION: {
    name: 'Searching and Optimization',
    topics: [
      'Searching',
      'Binary Search',
      'Sorting',
      'Two Pointers',
      'Sliding Window',
      'Prefix Sums',
      'Difference Arrays'
    ]
  },
  RECURSION_AND_ALGORITHMS: {
    name: 'Recursion and Algorithm Design',
    topics: [
      'Recursion',
      'Backtracking',
      'Greedy Algorithms',
      'Divide and Conquer',
      'Dynamic Programming',
      'Memoization',
      'Tabulation'
    ]
  },
  TREES_AND_GRAPHS: {
    name: 'Trees and Graphs',
    topics: [
      'Binary Trees',
      'Binary Search Trees',
      'Heaps',
      'Tries',
      'Graph Traversal',
      'BFS',
      'DFS',
      'Shortest Paths',
      'Minimum Spanning Trees',
      'Topological Sorting',
      'Disjoint Set Union'
    ]
  },
  ADVANCED_TOPICS: {
    name: 'Advanced Topics',
    topics: [
      'Segment Trees',
      'Fenwick Trees',
      'Monotonic Stacks',
      'Monotonic Queues',
      'Computational Geometry',
      'Advanced Graph Algorithms',
      'String Matching Algorithms',
      'KMP',
      'Rolling Hash'
    ]
  }
};

/**
 * Flat list of all standardized topics
 */
export const ALL_TOPICS = Object.values(TOPIC_CATEGORIES).flatMap(cat => cat.topics);

/**
 * Normalizes an array of raw topic strings returned by AI or extracted from platform tags
 * @param {string[]} rawTopics 
 * @returns {string[]} Normalized topic list
 */
export function normalizeTopics(rawTopics) {
  if (!Array.isArray(rawTopics) || rawTopics.length === 0) {
    return ['Algorithms'];
  }

  const normalized = [];
  const lowerMap = new Map(ALL_TOPICS.map(t => [t.toLowerCase(), t]));

  for (const raw of rawTopics) {
    const trimmed = String(raw).trim();
    const cleanLower = trimmed.toLowerCase().replace(/[-_]/g, ' ');
    
    // Check direct or space-cleaned version
    if (lowerMap.has(trimmed.toLowerCase())) {
      const match = lowerMap.get(trimmed.toLowerCase());
      if (!normalized.includes(match)) normalized.push(match);
    } else if (lowerMap.has(cleanLower)) {
      const match = lowerMap.get(cleanLower);
      if (!normalized.includes(match)) normalized.push(match);
    } else {
      // Capitalize words for clean custom topic
      const titleCase = cleanLower.replace(/\b\w/g, c => c.toUpperCase());
      if (!normalized.includes(titleCase)) normalized.push(titleCase);
    }
  }

  return normalized.length > 0 ? normalized : ['Algorithms'];
}
