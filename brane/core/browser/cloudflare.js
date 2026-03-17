import { BrowserEngine } from "./engine.js";

/**
 * Cloudflare Browser Rendering engine.
 * Uses the REST API directly — no Workers deployment needed.
 *
 * Requires:
 * - CF_API_TOKEN (Cloudflare API token with Browser Rendering permissions)
 * - CF_ACCOUNT_ID (Cloudflare account ID)
 *
 * Pricing: 10 hrs/month free, then $0.09/hr
 * Docs: https://developers.cloudflare.com/browser-rendering/
 */
export class CloudflareEngine extends BrowserEngine {
  constructor(options = {}) {
    super(options);
    this.name = "cloudflare";
    this.apiToken = options.apiToken || process.env.CF_API_TOKEN;
    this.accountId = options.accountId || process.env.CF_ACCOUNT_ID;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering`;
  }

  async isAvailable() {
    return !!(this.apiToken && this.accountId);
  }

  async connect() {
    if (!this.apiToken || !this.accountId) {
      throw new Error("CF_API_TOKEN and CF_ACCOUNT_ID required for Cloudflare Browser Rendering");
    }
    // Test connectivity
    try {
      const res = await this.cfFetch("/content", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
      });
      this.connected = true;
    } catch (err) {
      this.connected = false;
      throw new Error(`Cloudflare connection failed: ${err.message}`);
    }
  }

  async scrape(url, options = {}) {
    const timeout = options.timeout || 15000;

    // Use the /content endpoint for rendered HTML
    const result = await this.cfFetch("/content", {
      method: "POST",
      body: JSON.stringify({
        url,
        renderJs: true,
        waitUntil: "networkidle2",
        timeout,
        ...(options.waitFor ? { waitForSelector: options.waitFor } : {}),
      }),
    });

    const html = result.html || result.content || "";
    const text = extractTextFromHtml(html);
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || url;
    const images = options.extractImages !== false ? extractImagesFromHtml(html, url) : [];

    return {
      html,
      text,
      title,
      images,
      meta: {
        engine: "cloudflare",
        browserMs: result.browserMs,
        statusCode: result.statusCode,
      },
    };
  }

  async screenshot(url, options = {}) {
    try {
      const result = await this.cfFetch("/screenshot", {
        method: "POST",
        body: JSON.stringify({
          url,
          renderJs: true,
          screenshotOptions: {
            type: "png",
            fullPage: options.fullPage || false,
          },
        }),
      });
      return result;
    } catch {
      return null;
    }
  }

  async close() {
    this.connected = false;
  }

  getStatus() {
    return {
      name: this.name,
      connected: this.connected,
      configured: !!(this.apiToken && this.accountId),
    };
  }

  // ─── Private ───

  async cfFetch(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`Cloudflare API ${res.status}: ${errorBody.slice(0, 200)}`);
      }

      // Check content type — screenshot returns binary
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("image/")) {
        return Buffer.from(await res.arrayBuffer());
      }

      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ─── HTML Extraction Helpers ───

function extractTextFromHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

function extractImagesFromHtml(html, baseUrl) {
  const imgs = [];
  // Match both src and data-src (lazy loaded)
  const matches = html.matchAll(/<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/gi);
  let i = 0;
  for (const match of matches) {
    if (i >= 15) break;
    const src = match[1];
    if (src.startsWith("data:")) continue;
    if (src.includes("1x1") || src.includes("pixel") || src.includes("tracking")) continue;
    try {
      const fullUrl = src.startsWith("http") ? src : new URL(src, baseUrl).href;
      const ext = fullUrl.split(".").pop()?.split("?")[0] || "png";
      imgs.push({
        type: "image",
        name: `image-${i}.${ext}`,
        title: `Image ${i + 1}`,
        mimetype: `image/${ext === "jpg" ? "jpeg" : ext}`,
        url: fullUrl,
      });
      i++;
    } catch {
      // Invalid URL, skip
    }
  }
  return imgs;
}
