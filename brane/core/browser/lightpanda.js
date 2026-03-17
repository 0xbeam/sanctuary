import { BrowserEngine } from "./engine.js";

/**
 * Lightpanda browser engine — local headless browser via CDP.
 * 11x faster than Chrome, 9x less memory.
 *
 * Requires:
 * - Lightpanda running locally: ./lightpanda serve --host 127.0.0.1 --port 9222
 * - Set LIGHTPANDA_URL=ws://127.0.0.1:9222
 *
 * Falls back to puppeteer-core connecting to any CDP endpoint.
 * Also works with regular Chrome/Chromium if Lightpanda isn't available.
 */
export class LightpandaEngine extends BrowserEngine {
  constructor(options = {}) {
    super(options);
    this.name = "lightpanda";
    this.endpoint = options.endpoint || process.env.LIGHTPANDA_URL || "ws://127.0.0.1:9222";
    this.browser = null;
    this._puppeteer = null;
  }

  async isAvailable() {
    if (!this.endpoint) return false;

    // Check if the CDP endpoint is reachable
    try {
      const httpUrl = this.endpoint
        .replace("ws://", "http://")
        .replace("wss://", "https://")
        .replace(/\/$/, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${httpUrl}/json/version`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async connect() {
    try {
      this._puppeteer = (await import("puppeteer-core")).default;
    } catch {
      throw new Error("puppeteer-core is required for Lightpanda engine. Run: npm i puppeteer-core");
    }

    try {
      this.browser = await this._puppeteer.connect({
        browserWSEndpoint: this.endpoint,
        defaultViewport: { width: 1280, height: 800 },
      });
      this.connected = true;
    } catch (err) {
      this.connected = false;
      throw new Error(`Failed to connect to Lightpanda at ${this.endpoint}: ${err.message}`);
    }
  }

  async scrape(url, options = {}) {
    if (!this.browser || !this.connected) {
      await this.connect();
    }

    const page = await this.browser.newPage();
    const timeout = options.timeout || 15000;

    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout,
      });

      // Wait for optional selector
      if (options.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 5000 }).catch(() => {});
      }

      // Extract content from DOM
      const result = await page.evaluate(() => {
        const title = document.title || "";

        // Get main content text
        const mainContent = document.querySelector("main, article, [role='main'], .content, #content");
        const textSource = mainContent || document.body;
        const text = textSource ? textSource.innerText : "";

        // Get all images
        const images = Array.from(document.querySelectorAll("img")).map((img) => ({
          src: img.src || img.dataset?.src || "",
          alt: img.alt || "",
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        })).filter((img) =>
          img.src &&
          !img.src.startsWith("data:") &&
          img.width > 50 && img.height > 50  // Skip tiny tracking pixels
        );

        return { title, text, html: document.documentElement.outerHTML, images };
      });

      const images = (options.extractImages !== false ? result.images : []).slice(0, 15).map((img, i) => {
        const ext = img.src.split(".").pop()?.split("?")[0] || "png";
        return {
          type: "image",
          name: `image-${i}.${ext}`,
          title: img.alt || `Image ${i + 1}`,
          mimetype: `image/${ext === "jpg" ? "jpeg" : ext}`,
          url: img.src,
        };
      });

      return {
        html: result.html,
        text: result.text.slice(0, 10000),
        title: result.title,
        images,
        meta: {
          engine: "lightpanda",
        },
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async screenshot(url) {
    // Lightpanda doesn't support screenshots
    return null;
  }

  async close() {
    if (this.browser) {
      await this.browser.disconnect().catch(() => {});
      this.browser = null;
    }
    this.connected = false;
  }

  getStatus() {
    return {
      name: this.name,
      connected: this.connected,
      configured: !!this.endpoint,
      endpoint: this.endpoint,
    };
  }
}
