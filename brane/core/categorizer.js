/**
 * Shared feedback categorizer — keyword + signal detection.
 * Used across all adapters for consistent categorization.
 */

const FEEDBACK_SIGNALS = {
  approval: {
    keywords: ["looks good", "lgtm", "approved", "love it", "ship it", "perfect", "great", "nice", "awesome", "solid", "good to go", "yes"],
  },
  revision: {
    keywords: [
      "change", "update", "fix", "adjust", "move", "swap", "replace",
      "instead", "should be", "needs to", "can we", "could you", "try",
      "make it", "switch", "tweak", "modify", "redo", "rework",
    ],
  },
  question: {
    keywords: ["why", "how", "what if", "is this", "are we", "should we", "can we", "?"],
  },
  blocker: {
    keywords: [
      "blocker", "blocked", "can't ship", "don't ship", "stop", "hold",
      "critical", "breaking", "broken", "bug", "issue", "wrong",
    ],
  },
};

/**
 * Categorize a text string into feedback categories.
 * @param {string} text
 * @returns {'blocker' | 'revision' | 'question' | 'approval' | 'context'}
 */
export function categorize(text) {
  const lower = (text || "").toLowerCase();
  const scores = { approval: 0, revision: 0, question: 0, blocker: 0 };

  for (const [category, signals] of Object.entries(FEEDBACK_SIGNALS)) {
    for (const kw of signals.keywords) {
      if (lower.includes(kw)) scores[category]++;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "context";
}

export { FEEDBACK_SIGNALS };
