import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";
import { getBrowserManager, needsBrowser } from "../browser/index.js";

/**
 * Generic URL adapter — fetches a page and extracts text content.
 * Now supports dual-mode: plain fetch (fast) or browser rendering (for SPAs).
 *
 * Decision chain:
 * 1. If domain in SPA_DOMAINS → browser
 * 2. If plain fetch returns <1KB text → retry with browser
 * 3. If options.browser === true → browser
 * 4. Otherwise → plain fetch
 */
export class UrlAdapter extends BaseAdapter {
  static sourceType = "url";

  static canHandle() {
    return true; // fallback — always matches
  }

  async scrape(url, options = {}) {
    const browserManager = getBrowserManager();
    const forceBrowser = options.browser === true;
    const shouldTryBrowser = forceBrowser || browserManager.shouldUseBrowser(url);

    // ─── Browser mode ───
    if (shouldTryBrowser && browserManager.isAvailable()) {
      try {
        return await this.scrapeBrowser(url, options, browserManager);
      } catch (err) {
        // Fallback to fetch if browser fails
        console.warn(`Browser scrape failed for ${url}, falling back to fetch: ${err.message}`);
      }
    }

    // ─── Fetch mode (default) ───
    const result = await this.scrapeFetch(url, options);

    // Auto-retry with browser if fetch got very little content
    if (
      !shouldTryBrowser &&
      browserManager.isAvailable() &&
      result.root.text.length < 500
    ) {
      try {
        return await this.scrapeBrowser(url, options, browserManager);
      } catch {
        // Keep fetch result
      }
    }

    return result;
  }

  /**
   * Scrape using browser engine (Cloudflare or Lightpanda).
   */
  async scrapeBrowser(url, options, browserManager) {
    const result = await browserManager.scrape(url, {
      timeout: 15000,
      extractImages: true,
    });

    if (!result) throw new Error("Browser returned no result");

    const root = {
      id: generateId(),
      author: "Web Page",
      authorId: url,
      text: result.text,
      category: "context",
      attachments: result.images || [],
      timestamp: new Date().toISOString(),
      isRoot: true,
      meta: {
        url,
        engine: result.meta?.engine || "browser",
        statusCode: result.meta?.statusCode,
      },
    };

    const id = `url-${generateId()}`;

    return {
      id,
      source: "url",
      sourceUrl: url,
      project: options.project || "",
      title: (result.title || url).slice(0, 80),
      root,
      replies: [],
      allEntries: [root],
      stats: {
        totalEntries: 1,
        totalReplies: 0,
        categories: { context: 1 },
        imageCount: (result.images || []).length,
        fileCount: 0,
        blockerCount: 0,
        revisionCount: 0,
      },
      scrapedAt: new Date().toISOString(),
      meta: { engine: result.meta?.engine },
    };
  }

  /**
   * Scrape using plain fetch (fast, no JS rendering).
   */
  async scrapeFetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || url;
    const text = extractText(html);

    const root = {
      id: generateId(),
      author: "Web Page",
      authorId: url,
      text,
      category: "context",
      attachments: extractImages(html, url),
      timestamp: new Date().toISOString(),
      isRoot: true,
      meta: { url, engine: "fetch", statusCode: response.status },
    };

    const id = `url-${generateId()}`;

    return {
      id,
      source: "url",
      sourceUrl: url,
      project: options.project || "",
      title: title.slice(0, 80),
      root,
      replies: [],
      allEntries: [root],
      stats: {
        totalEntries: 1,
        totalReplies: 0,
        categories: { context: 1 },
        imageCount: root.attachments.filter((a) => a.type === "image").length,
        fileCount: 0,
        blockerCount: 0,
        revisionCount: 0,
      },
      scrapedAt: new Date().toISOString(),
      meta: { engine: "fetch" },
    };
  }

  /**
   * Download images — now parallel with concurrency limit.
   */
  async downloadAssets(instructionSet, outputDir) {
    const { mkdir, writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const imagesDir = join(outputDir, "images");
    await mkdir(imagesDir, { recursive: true });

    const images = instructionSet.allEntries.flatMap((e) =>
      e.attachments.filter((a) => a.type === "image")
    );

    if (images.length === 0) return { downloaded: 0, total: 0 };

    // Download in parallel batches of 5
    const BATCH_SIZE = 5;
    let downloaded = 0;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (img) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(img.url, { signal: controller.signal });
            if (!response.ok) return;
            const buffer = Buffer.from(await response.arrayBuffer());
            await writeFile(join(imagesDir, img.name), buffer);
            img.localPath = `images/${img.name}`;
            return true;
          } finally {
            clearTimeout(timeout);
          }
        })
      );
      downloaded += results.filter((r) => r.status === "fulfilled" && r.value).length;
    }

    return { downloaded, total: images.length };
  }
}

function extractText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function extractImages(html, baseUrl) {
  const imgs = [];
  const matches = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi);
  let i = 0;
  for (const match of matches) {
    if (i >= 10) break;
    const src = match[1];
    if (src.startsWith("data:")) continue;
    try {
      const fullUrl = src.startsWith("http") ? src : new URL(src, baseUrl).href;
      const name = `image-${i}.${fullUrl.split(".").pop()?.split("?")[0] || "png"}`;
      imgs.push({
        type: "image",
        name,
        title: `Image ${i + 1}`,
        mimetype: "image/png",
        url: fullUrl,
      });
      i++;
    } catch {
      // Invalid URL, skip
    }
  }
  return imgs;
}
