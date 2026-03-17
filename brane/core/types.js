/**
 * Unified data model for the Brane platform.
 * All source adapters produce InstructionSet objects conforming to this shape.
 */

/** @typedef {'blocker' | 'revision' | 'question' | 'approval' | 'context'} Category */
/** @typedef {'slack' | 'twitter' | 'figma' | 'url'} SourceType */
/** @typedef {'pending' | 'processing' | 'complete' | 'error'} JobStatus */

/**
 * @typedef {Object} Attachment
 * @property {'image' | 'file'} type
 * @property {string} name
 * @property {string} title
 * @property {string} mimetype
 * @property {string} url
 * @property {string} [localPath]
 * @property {string} [permalink]
 */

/**
 * @typedef {Object} FeedbackEntry
 * @property {string} id
 * @property {string} author
 * @property {string} authorId
 * @property {string} text
 * @property {Category} category
 * @property {Attachment[]} attachments
 * @property {string} timestamp - ISO 8601
 * @property {boolean} isRoot
 * @property {Object} meta - Source-specific metadata (reactions, likes, etc.)
 */

/**
 * @typedef {Object} InstructionStats
 * @property {number} totalEntries
 * @property {number} totalReplies
 * @property {Object<Category, number>} categories
 * @property {number} imageCount
 * @property {number} fileCount
 * @property {number} blockerCount
 * @property {number} revisionCount
 */

/**
 * @typedef {Object} InstructionSet
 * @property {string} id
 * @property {SourceType} source
 * @property {string} sourceUrl
 * @property {string} project
 * @property {string} title
 * @property {FeedbackEntry} root
 * @property {FeedbackEntry[]} replies
 * @property {FeedbackEntry[]} allEntries
 * @property {InstructionStats} stats
 * @property {string} scrapedAt - ISO 8601
 * @property {string} [markdownPath]
 */

/**
 * @typedef {Object} DispatchJob
 * @property {string} id
 * @property {string} url
 * @property {SourceType} detectedSource
 * @property {JobStatus} status
 * @property {string} project
 * @property {InstructionSet|null} result
 * @property {string|null} error
 * @property {string} createdAt
 * @property {string|null} completedAt
 */

export const CATEGORIES = ["blocker", "revision", "question", "approval", "context"];
export const SOURCE_TYPES = ["slack", "twitter", "figma", "url"];

export const CATEGORY_COLORS = {
  blocker: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
  revision: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  question: { bg: "#DBEAFE", text: "#1E40AF", border: "#BFDBFE" },
  approval: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  context: { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB" },
};

export const CATEGORY_LABELS = {
  blocker: "Blocker",
  revision: "Change Requested",
  question: "Question",
  approval: "Approved",
  context: "Context",
};

export const SOURCE_LABELS = {
  slack: "Slack",
  twitter: "Twitter/X",
  figma: "Figma",
  url: "URL",
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
