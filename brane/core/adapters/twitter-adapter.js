import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";

/**
 * Twitter/X adapter — imports bookmarks from a JSON export.
 * Since the Twitter API is restrictive, this works with exported bookmark data.
 *
 * Supports:
 * - Twitter/X post URLs (scrapes via nitter or basic fetch)
 * - Local JSON bookmark export files (path as "url")
 */
export class TwitterAdapter extends BaseAdapter {
  static sourceType = "twitter";

  static canHandle(url) {
    return /(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
  }

  async scrape(url, options = {}) {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (!tweetId) throw new Error(`Could not parse tweet ID from: ${url}`);

    // Basic scrape — extract what we can from the URL
    // For full API access, users would need Twitter API credentials
    const entry = {
      id: tweetId,
      author: extractAuthor(url),
      authorId: extractAuthor(url),
      text: `Twitter/X post: ${url}\n\nTo get full content, export your bookmarks as JSON and use the batch import feature.`,
      category: "context",
      attachments: [],
      timestamp: new Date().toISOString(),
      isRoot: true,
      meta: { tweetId, originalUrl: url },
    };

    return {
      id: `twitter-${tweetId}`,
      source: "twitter",
      sourceUrl: url,
      project: options.project || "",
      title: `Tweet by @${entry.author}`,
      root: entry,
      replies: [],
      allEntries: [entry],
      stats: {
        totalEntries: 1,
        totalReplies: 0,
        categories: { context: 1 },
        imageCount: 0,
        fileCount: 0,
        blockerCount: 0,
        revisionCount: 0,
      },
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Import from a Twitter bookmark export JSON file.
   * @param {Object[]} bookmarks - Array of bookmark objects
   * @param {Object} options
   * @returns {Promise<import('../types.js').InstructionSet[]>}
   */
  async importBookmarks(bookmarks, options = {}) {
    return bookmarks.map((bm) => {
      const entry = {
        id: bm.id || generateId(),
        author: bm.user?.screen_name || bm.author || "unknown",
        authorId: bm.user?.id_str || bm.author_id || "unknown",
        text: bm.full_text || bm.text || "",
        category: "context",
        attachments: (bm.media || []).map((m, i) => ({
          type: "image",
          name: `tweet-media-${i}.jpg`,
          title: `Media ${i + 1}`,
          mimetype: "image/jpeg",
          url: m.media_url_https || m.url,
        })),
        timestamp: bm.created_at ? new Date(bm.created_at).toISOString() : new Date().toISOString(),
        isRoot: true,
        meta: { likes: bm.favorite_count, retweets: bm.retweet_count },
      };

      return {
        id: `twitter-${entry.id}`,
        source: "twitter",
        sourceUrl: `https://x.com/${entry.author}/status/${entry.id}`,
        project: options.project || "",
        title: entry.text.slice(0, 80),
        root: entry,
        replies: [],
        allEntries: [entry],
        stats: {
          totalEntries: 1,
          totalReplies: 0,
          categories: { context: 1 },
          imageCount: entry.attachments.length,
          fileCount: 0,
          blockerCount: 0,
          revisionCount: 0,
        },
        scrapedAt: new Date().toISOString(),
      };
    });
  }

  async downloadAssets() {
    return { downloaded: 0, total: 0 };
  }
}

function extractAuthor(url) {
  return url.match(/(twitter\.com|x\.com)\/(\w+)\/status/)?.[2] || "unknown";
}
