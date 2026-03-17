import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";

/**
 * Figma adapter — extracts comments from a Figma file.
 * Requires FIGMA_TOKEN env var.
 */
export class FigmaAdapter extends BaseAdapter {
  static sourceType = "figma";

  static canHandle(url) {
    return /figma\.com\/(file|design|proto)\//.test(url);
  }

  async scrape(url, options = {}) {
    const token = options.env?.FIGMA_TOKEN || process.env.FIGMA_TOKEN;
    if (!token) throw new Error("FIGMA_TOKEN not set");

    const fileKey = url.match(/\/(file|design|proto)\/([a-zA-Z0-9]+)/)?.[2];
    if (!fileKey) throw new Error(`Could not parse Figma file key from: ${url}`);

    // Fetch file metadata
    const fileMeta = await figmaApi(`/v1/files/${fileKey}?depth=1`, token);
    const fileName = fileMeta.name || "Figma File";

    // Fetch comments
    const commentsRes = await figmaApi(`/v1/files/${fileKey}/comments`, token);
    const comments = commentsRes.comments || [];

    // Build entries
    const entries = [];
    const rootComments = comments.filter((c) => !c.parent_id);
    const childComments = comments.filter((c) => c.parent_id);

    // Group by thread (root comment + replies)
    for (const root of rootComments) {
      const replies = childComments.filter((c) => c.parent_id === root.id);
      const allInThread = [root, ...replies];

      for (let i = 0; i < allInThread.length; i++) {
        const c = allInThread[i];
        entries.push({
          id: c.id,
          author: c.user.handle,
          authorId: c.user.id,
          text: c.message,
          category: i === 0 ? "context" : categorizeComment(c.message),
          attachments: [],
          timestamp: c.created_at,
          isRoot: i === 0 && entries.length === 0,
          meta: {
            resolved: c.resolved_at != null,
            nodeId: c.client_meta?.node_id,
            nodeOffset: c.client_meta?.node_offset,
          },
        });
      }
    }

    // If no comments, create a single context entry
    if (entries.length === 0) {
      entries.push({
        id: generateId(),
        author: "Figma",
        authorId: "figma",
        text: `Figma file: ${fileName}\n${url}`,
        category: "context",
        attachments: [],
        timestamp: new Date().toISOString(),
        isRoot: true,
        meta: {},
      });
    }

    const categories = {};
    for (const e of entries) {
      categories[e.category] = (categories[e.category] || 0) + 1;
    }

    return {
      id: `figma-${fileKey}`,
      source: "figma",
      sourceUrl: url,
      project: options.project || "",
      title: fileName,
      root: entries[0],
      replies: entries.slice(1),
      allEntries: entries,
      stats: {
        totalEntries: entries.length,
        totalReplies: entries.length - 1,
        categories,
        imageCount: 0,
        fileCount: 0,
        blockerCount: categories.blocker || 0,
        revisionCount: categories.revision || 0,
      },
      scrapedAt: new Date().toISOString(),
    };
  }

  async downloadAssets() {
    return { downloaded: 0, total: 0 };
  }
}

async function figmaApi(path, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://api.figma.com${path}`, {
      headers: { "X-FIGMA-TOKEN": token },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Figma API error: ${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function categorizeComment(text) {
  const lower = (text || "").toLowerCase();
  if (/blocker|broken|critical|bug|wrong/.test(lower)) return "blocker";
  if (/change|fix|update|adjust|move|swap|should be|instead/.test(lower)) return "revision";
  if (/\?|why|how|what if/.test(lower)) return "question";
  if (/looks good|lgtm|approved|love|great|nice|perfect/.test(lower)) return "approval";
  return "context";
}
