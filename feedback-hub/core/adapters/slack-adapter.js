import { WebClient } from "@slack/web-api";
import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";

// --- Slack-specific helpers (ported from slack-thread-to-instructions) ---

const FEEDBACK_SIGNALS = {
  approval: {
    emoji: ["white_check_mark", "+1", "thumbsup", "heavy_check_mark", "100", "fire", "heart", "tada", "rocket"],
    keywords: ["looks good", "lgtm", "approved", "love it", "ship it", "perfect", "great", "nice", "awesome", "solid", "good to go", "yes"],
  },
  revision: {
    emoji: ["x", "warning", "thinking_face", "eyes", "memo"],
    keywords: [
      "change", "update", "fix", "adjust", "move", "swap", "replace",
      "instead", "should be", "needs to", "can we", "could you", "try",
      "make it", "switch", "tweak", "modify", "redo", "rework",
    ],
  },
  question: {
    emoji: ["question", "thinking_face"],
    keywords: ["why", "how", "what if", "is this", "are we", "should we", "can we", "?"],
  },
  blocker: {
    emoji: ["octagonal_sign", "no_entry", "rotating_light", "x"],
    keywords: [
      "blocker", "blocked", "can't ship", "don't ship", "stop", "hold",
      "critical", "breaking", "broken", "bug", "issue", "wrong",
    ],
  },
};

function categorizeMessage(text, reactions) {
  const lower = (text || "").toLowerCase();
  const scores = { approval: 0, revision: 0, question: 0, blocker: 0 };

  for (const [category, signals] of Object.entries(FEEDBACK_SIGNALS)) {
    for (const kw of signals.keywords) {
      if (lower.includes(kw)) scores[category]++;
    }
  }

  if (reactions) {
    for (const reaction of reactions) {
      for (const [category, signals] of Object.entries(FEEDBACK_SIGNALS)) {
        if (signals.emoji.includes(reaction.name)) {
          scores[category] += reaction.count;
        }
      }
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "context";
}

function parseThreadUrl(url) {
  const match = url.match(
    /archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})(?:\?.*thread_ts=(\d+\.\d+))?/
  );
  if (!match) {
    throw new Error(`Invalid Slack thread URL: ${url}`);
  }
  return {
    channelId: match[1],
    threadTs: match[4] || `${match[2]}.${match[3]}`,
  };
}

const userCache = new Map();

async function resolveUser(client, userId) {
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const result = await client.users.info({ user: userId });
    const name = result.user.profile.display_name || result.user.real_name || result.user.name;
    userCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

async function resolveUserMentions(client, text) {
  if (!text) return "";
  const matches = [...text.matchAll(/<@([A-Z0-9]+)>/g)];
  let resolved = text;
  for (const match of matches) {
    const name = await resolveUser(client, match[1]);
    resolved = resolved.replace(match[0], `@${name}`);
  }
  return resolved;
}

// --- Adapter ---

export class SlackAdapter extends BaseAdapter {
  static sourceType = "slack";

  static canHandle(url) {
    return /slack\.com\/archives\/[A-Z0-9]+\/p\d+/.test(url);
  }

  async scrape(url, options = {}) {
    const token = options.env?.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error("SLACK_BOT_TOKEN not set");

    const client = new WebClient(token);
    const { channelId, threadTs } = parseThreadUrl(url);

    // Fetch all messages
    const messages = [];
    let cursor;
    do {
      const result = await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 200,
        cursor,
      });
      messages.push(...result.messages);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // Convert to unified FeedbackEntry format
    const entries = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const author = await resolveUser(client, msg.user);
      const text = await resolveUserMentions(client, msg.text);
      const isRoot = i === 0;
      const category = isRoot ? "context" : categorizeMessage(msg.text, msg.reactions);

      const attachments = (msg.files || []).map((f) => ({
        type: f.mimetype?.startsWith("image/") ? "image" : "file",
        name: f.name,
        title: f.title || f.name,
        mimetype: f.mimetype,
        url: f.url_private,
        permalink: f.permalink,
      }));

      entries.push({
        id: msg.ts,
        author,
        authorId: msg.user,
        text,
        category,
        attachments,
        timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        isRoot,
        meta: { reactions: msg.reactions || [] },
      });
    }

    const allAttachments = entries.flatMap((e) => e.attachments);
    const imageCount = allAttachments.filter((a) => a.type === "image").length;
    const categories = {};
    for (const e of entries) {
      categories[e.category] = (categories[e.category] || 0) + 1;
    }

    const title = entries[0]?.text?.split("\n")[0]?.slice(0, 80) || "Slack Thread";
    const id = `slack-${threadTs.replace(".", "-")}`;

    return {
      id,
      source: "slack",
      sourceUrl: url,
      project: options.project || "",
      title,
      root: entries[0],
      replies: entries.slice(1),
      allEntries: entries,
      stats: {
        totalEntries: entries.length,
        totalReplies: entries.length - 1,
        categories,
        imageCount,
        fileCount: allAttachments.length - imageCount,
        blockerCount: categories.blocker || 0,
        revisionCount: categories.revision || 0,
      },
      scrapedAt: new Date().toISOString(),
    };
  }

  async downloadAssets(instructionSet, outputDir) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return { downloaded: 0, total: 0 };

    const { mkdir, writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const imagesDir = join(outputDir, "images");
    await mkdir(imagesDir, { recursive: true });

    const allAttachments = instructionSet.allEntries.flatMap((e) => e.attachments);
    const images = allAttachments.filter((a) => a.type === "image");
    let downloaded = 0;

    for (const img of images) {
      try {
        const response = await fetch(img.url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(join(imagesDir, img.name), buffer);
        img.localPath = `images/${img.name}`;
        downloaded++;
      } catch {
        // skip failed downloads
      }
    }

    return { downloaded, total: images.length };
  }
}
