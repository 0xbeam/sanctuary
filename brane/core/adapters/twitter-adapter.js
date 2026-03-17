import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";
import { getBrowserManager } from "../browser/index.js";
import { categorize } from "../categorizer.js";

/**
 * Twitter/X adapter — multi-strategy tweet scraping.
 *
 * Strategy chain (tries in order, first success wins):
 * 1. Twitter oEmbed API (publish.twitter.com, official, no auth)
 * 2. Twitter Syndication API (embed endpoint, no auth)
 * 3. fxtwitter API (public proxy, structured JSON)
 * 4. Browser engine (Cloudflare/Lightpanda if available)
 * 5. Nitter instances (public mirrors, no JS needed)
 *
 * Also supports:
 * - Thread scraping (tweet + replies in thread)
 * - Image/media extraction
 * - Local JSON bookmark export import
 */
export class TwitterAdapter extends BaseAdapter {
  static sourceType = "twitter";

  static canHandle(url) {
    return /(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
  }

  async scrape(url, options = {}) {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (!tweetId) throw new Error(`Could not parse tweet ID from: ${url}`);

    const author = extractAuthor(url);

    // Try each strategy in order — oEmbed first (most reliable)
    const strategies = [
      () => this.scrapeOEmbed(tweetId, author, url),
      () => this.scrapeSyndication(tweetId, url),
      () => this.scrapeFxTwitter(tweetId, author, url),
      () => this.scrapeBrowser(url),
      () => this.scrapeNitter(tweetId, author, url),
    ];

    let tweetData = null;
    let strategyUsed = "none";

    for (const strategy of strategies) {
      try {
        tweetData = await strategy();
        if (tweetData && tweetData.text && tweetData.text.length > 10) {
          strategyUsed = tweetData.strategy;
          break;
        }
      } catch (err) {
        // Try next strategy
        continue;
      }
    }

    // If all strategies failed, return what we can
    if (!tweetData || !tweetData.text) {
      tweetData = {
        text: `Could not fetch tweet content. The tweet may be protected, deleted, or all scraping strategies failed.`,
        author: author,
        authorName: author,
        timestamp: new Date().toISOString(),
        images: [],
        likes: 0,
        retweets: 0,
        replies: 0,
        strategy: "fallback",
        thread: [],
      };
      strategyUsed = "fallback";
    }

    // Build the root entry
    const category = categorize(tweetData.text);
    const rootEntry = {
      id: tweetId,
      author: tweetData.authorName || tweetData.author || author,
      authorId: `@${tweetData.author || author}`,
      text: tweetData.text,
      category,
      attachments: (tweetData.images || []).map((img, i) => ({
        type: "image",
        name: `tweet-media-${i}.jpg`,
        title: `Media ${i + 1}`,
        mimetype: "image/jpeg",
        url: img,
      })),
      timestamp: tweetData.timestamp || new Date().toISOString(),
      isRoot: true,
      meta: {
        tweetId,
        originalUrl: url,
        likes: tweetData.likes || 0,
        retweets: tweetData.retweets || 0,
        replyCount: tweetData.replies || 0,
        strategy: strategyUsed,
      },
    };

    // Build thread replies
    const replyEntries = (tweetData.thread || []).map((reply, i) => ({
      id: reply.id || `${tweetId}-reply-${i}`,
      author: reply.authorName || reply.author || author,
      authorId: `@${reply.author || author}`,
      text: reply.text,
      category: categorize(reply.text),
      attachments: (reply.images || []).map((img, j) => ({
        type: "image",
        name: `reply-${i}-media-${j}.jpg`,
        title: `Reply ${i + 1} Media ${j + 1}`,
        mimetype: "image/jpeg",
        url: img,
      })),
      timestamp: reply.timestamp || new Date().toISOString(),
      isRoot: false,
      meta: {
        tweetId: reply.id,
        strategy: strategyUsed,
      },
    }));

    const allEntries = [rootEntry, ...replyEntries];
    const categories = {};
    for (const e of allEntries) {
      categories[e.category] = (categories[e.category] || 0) + 1;
    }

    const imageCount = allEntries.reduce((sum, e) => sum + e.attachments.length, 0);

    return {
      id: `twitter-${tweetId}`,
      source: "twitter",
      sourceUrl: url,
      project: options.project || "",
      title: `@${rootEntry.author}: ${tweetData.text.slice(0, 60)}${tweetData.text.length > 60 ? "..." : ""}`,
      root: rootEntry,
      replies: replyEntries,
      allEntries,
      stats: {
        totalEntries: allEntries.length,
        totalReplies: replyEntries.length,
        categories,
        imageCount,
        fileCount: 0,
        blockerCount: categories.blocker || 0,
        revisionCount: categories.revision || 0,
      },
      scrapedAt: new Date().toISOString(),
      meta: { engine: strategyUsed },
    };
  }

  // ─── Strategy 1: Twitter oEmbed API ───
  // Official endpoint, most reliable, returns tweet text in blockquote HTML
  async scrapeOEmbed(tweetId, author, originalUrl) {
    // oEmbed requires twitter.com URLs (not x.com)
    const twitterUrl = `https://twitter.com/${author}/status/${tweetId}`;
    const url = `https://publish.twitter.com/oembed?url=${encodeURIComponent(twitterUrl)}&omit_script=true`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Brane/1.0)",
        "Accept": "application/json",
      },
    }, 8000);

    if (!res.ok) throw new Error(`oEmbed API ${res.status}`);

    const data = await res.json();
    if (!data || !data.html) throw new Error("No HTML in oEmbed response");

    // Extract tweet text from the blockquote HTML
    // Format: <blockquote><p>TWEET TEXT</p>&mdash; Author (@handle) <a>Date</a></blockquote>
    const textMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const text = textMatch
      ? textMatch[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<a[^>]+>([\s\S]*?)<\/a>/gi, "$1")
          .replace(/<[^>]+>/g, "")
          .replace(/&mdash;/g, "—")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .trim()
      : "";

    if (!text) throw new Error("Could not extract text from oEmbed HTML");

    // Extract date from the oEmbed HTML
    const dateMatch = data.html.match(/href="[^"]*">([^<]+)<\/a><\/blockquote>/);
    let timestamp = new Date().toISOString();
    if (dateMatch) {
      try { timestamp = new Date(dateMatch[1]).toISOString(); } catch { /* keep default */ }
    }

    // Extract images from the oEmbed HTML (pic.twitter.com links)
    const images = [];
    const imgLinks = data.html.matchAll(/pic\.twitter\.com\/\w+/g);
    // Note: oEmbed doesn't include direct image URLs, just pic.twitter.com short links
    // We'll extract what we can from the syndication API later if needed

    return {
      text,
      author: data.author_url?.split("/").pop() || author,
      authorName: data.author_name || author,
      timestamp,
      images,
      likes: 0, // oEmbed doesn't include engagement metrics
      retweets: 0,
      replies: 0,
      strategy: "oembed",
      thread: [],
    };
  }

  // ─── Strategy 2: Twitter Syndication API ───
  // The embed/tweet endpoint returns rendered tweet data without auth
  async scrapeSyndication(tweetId, originalUrl) {
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Brane/1.0)",
        "Accept": "application/json",
      },
    }, 8000);

    if (!res.ok) throw new Error(`Syndication API ${res.status}`);

    const data = await res.json();
    if (!data || !data.text) throw new Error("No text in syndication response");

    const images = [];
    // Extract media from syndication response
    if (data.mediaDetails) {
      for (const media of data.mediaDetails) {
        if (media.media_url_https) {
          images.push(media.media_url_https);
        }
      }
    }
    if (data.photos) {
      for (const photo of data.photos) {
        if (photo.url) images.push(photo.url);
      }
    }

    // Extract thread/quoted tweets
    const thread = [];
    if (data.quoted_tweet) {
      thread.push({
        id: data.quoted_tweet.id_str,
        author: data.quoted_tweet.user?.screen_name || "unknown",
        authorName: data.quoted_tweet.user?.name || "unknown",
        text: data.quoted_tweet.text,
        timestamp: data.quoted_tweet.created_at ? new Date(data.quoted_tweet.created_at).toISOString() : undefined,
        images: (data.quoted_tweet.photos || []).map((p) => p.url).filter(Boolean),
      });
    }

    return {
      text: data.text,
      author: data.user?.screen_name || extractAuthor(originalUrl),
      authorName: data.user?.name || data.user?.screen_name || extractAuthor(originalUrl),
      timestamp: data.created_at ? new Date(data.created_at).toISOString() : new Date().toISOString(),
      images,
      likes: data.favorite_count || 0,
      retweets: data.retweet_count || 0,
      replies: data.conversation_count || 0,
      strategy: "syndication",
      thread,
    };
  }

  // ─── Strategy 2: fxtwitter API ───
  // Public proxy that returns structured tweet data
  async scrapeFxTwitter(tweetId, author, originalUrl) {
    const url = `https://api.fxtwitter.com/${author}/status/${tweetId}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Brane/1.0)",
        "Accept": "application/json",
      },
    }, 8000);

    if (!res.ok) throw new Error(`fxtwitter API ${res.status}`);

    const data = await res.json();
    const tweet = data.tweet;
    if (!tweet || !tweet.text) throw new Error("No tweet in fxtwitter response");

    const images = [];
    if (tweet.media?.photos) {
      for (const photo of tweet.media.photos) {
        if (photo.url) images.push(photo.url);
      }
    }
    // Also grab video thumbnails
    if (tweet.media?.videos) {
      for (const video of tweet.media.videos) {
        if (video.thumbnail_url) images.push(video.thumbnail_url);
      }
    }

    return {
      text: tweet.text,
      author: tweet.author?.screen_name || author,
      authorName: tweet.author?.name || author,
      timestamp: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
      images,
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      replies: tweet.replies || 0,
      strategy: "fxtwitter",
      thread: [],
    };
  }

  // ─── Strategy 3: Browser Engine ───
  // Use Cloudflare/Lightpanda to render the full page
  async scrapeBrowser(url) {
    const browserManager = getBrowserManager();
    if (!browserManager.isAvailable()) throw new Error("No browser engine available");

    const result = await browserManager.scrape(url, {
      timeout: 20000,
      waitFor: "[data-testid='tweetText']",
      extractImages: true,
    });

    if (!result || !result.text) throw new Error("Browser returned no content");

    // Parse the rendered HTML for tweet-specific content
    const tweetData = parseTweetFromHtml(result.html || result.text, url);

    return {
      text: tweetData.text || result.text.slice(0, 3000),
      author: tweetData.author || extractAuthor(url),
      authorName: tweetData.authorName || extractAuthor(url),
      timestamp: new Date().toISOString(),
      images: tweetData.images || (result.images || []).map((i) => i.url).filter(Boolean),
      likes: tweetData.likes || 0,
      retweets: tweetData.retweets || 0,
      replies: tweetData.replies || 0,
      strategy: `browser:${browserManager.activeEngine?.name || "unknown"}`,
      thread: tweetData.thread || [],
    };
  }

  // ─── Strategy 4: Nitter Instances ───
  // Public Nitter mirrors serve Twitter content as static HTML
  async scrapeNitter(tweetId, author, originalUrl) {
    const nitterInstances = [
      "nitter.privacydev.net",
      "nitter.poast.org",
      "nitter.woodland.cafe",
    ];

    for (const instance of nitterInstances) {
      try {
        const url = `https://${instance}/${author}/status/${tweetId}`;
        const res = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Brane/1.0)",
          },
        }, 8000);

        if (!res.ok) continue;

        const html = await res.text();
        const tweetData = parseTweetFromNitter(html);

        if (tweetData && tweetData.text) {
          return {
            ...tweetData,
            author,
            strategy: `nitter:${instance}`,
          };
        }
      } catch {
        continue;
      }
    }

    throw new Error("All Nitter instances failed");
  }

  /**
   * Import from a Twitter bookmark export JSON file.
   */
  async importBookmarks(bookmarks, options = {}) {
    return bookmarks.map((bm) => {
      const text = bm.full_text || bm.text || "";
      const category = categorize(text);
      const entry = {
        id: bm.id || generateId(),
        author: bm.user?.screen_name || bm.author || "unknown",
        authorId: bm.user?.id_str || bm.author_id || "unknown",
        text,
        category,
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
          categories: { [category]: 1 },
          imageCount: entry.attachments.length,
          fileCount: 0,
          blockerCount: category === "blocker" ? 1 : 0,
          revisionCount: category === "revision" ? 1 : 0,
        },
        scrapedAt: new Date().toISOString(),
      };
    });
  }

  async downloadAssets(instructionSet, outputDir) {
    const { mkdir, writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const imagesDir = join(outputDir, "images");
    await mkdir(imagesDir, { recursive: true });

    const images = instructionSet.allEntries.flatMap((e) =>
      e.attachments.filter((a) => a.type === "image")
    );

    if (images.length === 0) return { downloaded: 0, total: 0 };

    let downloaded = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (img) => {
          try {
            const res = await fetchWithTimeout(img.url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; Brane/1.0)" },
            }, 8000);
            if (!res.ok) return;
            const buffer = Buffer.from(await res.arrayBuffer());
            await writeFile(join(imagesDir, img.name), buffer);
            img.localPath = `images/${img.name}`;
            return true;
          } catch {
            return false;
          }
        })
      );
      downloaded += results.filter((r) => r.status === "fulfilled" && r.value).length;
    }

    return { downloaded, total: images.length };
  }
}

// ─── Helpers ───

function extractAuthor(url) {
  return url.match(/(twitter\.com|x\.com)\/(\w+)\/status/)?.[2] || "unknown";
}

/**
 * Fetch with a timeout (AbortController).
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse tweet content from rendered HTML (browser engine output).
 * Extracts tweet text, media, and engagement metrics.
 */
function parseTweetFromHtml(html, originalUrl) {
  const result = {
    text: "",
    author: extractAuthor(originalUrl),
    authorName: "",
    images: [],
    likes: 0,
    retweets: 0,
    replies: 0,
    thread: [],
  };

  // Extract tweet text from data-testid="tweetText"
  const tweetTextMatch = html.match(
    /data-testid="tweetText"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (tweetTextMatch) {
    result.text = tweetTextMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Extract display name
  const nameMatch = html.match(
    /data-testid="User-Name"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i
  );
  if (nameMatch) {
    result.authorName = nameMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  // Extract images from tweet media
  const imgMatches = html.matchAll(
    /data-testid="tweetPhoto"[\s\S]*?<img[^>]+src="([^"]+)"/gi
  );
  for (const match of imgMatches) {
    const src = match[1];
    if (src && !src.includes("emoji") && !src.includes("profile_images")) {
      result.images.push(src);
    }
  }

  // Also look for og:image meta tags (tweet card images)
  const ogImageMatch = html.match(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
  );
  if (ogImageMatch && result.images.length === 0) {
    result.images.push(ogImageMatch[1]);
  }

  // Extract engagement metrics
  const likesMatch = html.match(/(\d[\d,]*)\s*(?:Likes?|likes?)/);
  if (likesMatch) result.likes = parseInt(likesMatch[1].replace(/,/g, ""), 10);

  const retweetsMatch = html.match(/(\d[\d,]*)\s*(?:Repost|repost|Retweet)/);
  if (retweetsMatch) result.retweets = parseInt(retweetsMatch[1].replace(/,/g, ""), 10);

  const repliesMatch = html.match(/(\d[\d,]*)\s*(?:Repl|repl)/);
  if (repliesMatch) result.replies = parseInt(repliesMatch[1].replace(/,/g, ""), 10);

  return result;
}

/**
 * Parse tweet content from Nitter HTML.
 */
function parseTweetFromNitter(html) {
  const result = {
    text: "",
    authorName: "",
    images: [],
    likes: 0,
    retweets: 0,
    replies: 0,
    thread: [],
  };

  // Nitter puts tweet content in .tweet-content
  const contentMatch = html.match(
    /class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (contentMatch) {
    result.text = contentMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Nitter display name
  const nameMatch = html.match(
    /class="fullname"[^>]*>([\s\S]*?)<\/a>/i
  );
  if (nameMatch) {
    result.authorName = nameMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  // Nitter images
  const imgMatches = html.matchAll(
    /class="still-image"[^>]+href="([^"]+)"/gi
  );
  for (const match of imgMatches) {
    result.images.push(match[1]);
  }

  // Nitter engagement — in .tweet-stat spans
  const statsSection = html.match(/class="tweet-stats[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (statsSection) {
    const stats = statsSection[1];
    const replyCount = stats.match(/class="icon-comment[^"]*"[\s\S]*?(\d[\d,]*)/);
    const rtCount = stats.match(/class="icon-retweet[^"]*"[\s\S]*?(\d[\d,]*)/);
    const likeCount = stats.match(/class="icon-heart[^"]*"[\s\S]*?(\d[\d,]*)/);
    if (replyCount) result.replies = parseInt(replyCount[1].replace(/,/g, ""), 10);
    if (rtCount) result.retweets = parseInt(rtCount[1].replace(/,/g, ""), 10);
    if (likeCount) result.likes = parseInt(likeCount[1].replace(/,/g, ""), 10);
  }

  // Nitter thread replies (main-thread class)
  const threadMatches = html.matchAll(
    /class="timeline-item[^"]*"[\s\S]*?class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  );
  let isFirst = true;
  for (const match of threadMatches) {
    if (isFirst) { isFirst = false; continue; } // Skip the root tweet
    const replyText = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (replyText) {
      result.thread.push({
        text: replyText,
        images: [],
      });
    }
  }

  return result;
}
