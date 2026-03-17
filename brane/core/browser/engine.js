/**
 * BrowserEngine — abstract interface for headless browser scraping.
 * Implementations: CloudflareEngine, LightpandaEngine
 *
 * The engine provides a unified way to:
 * - Scrape JS-rendered pages (SPAs)
 * - Extract text/images from DOM
 * - Take screenshots (Cloudflare only)
 */
export class BrowserEngine {
  constructor(options = {}) {
    this.name = "base";
    this.connected = false;
    this.options = options;
  }

  /** Check if the engine is available and configured */
  async isAvailable() { return false; }

  /** Connect / warm up */
  async connect() { throw new Error("Not implemented"); }

  /**
   * Scrape a URL with full JS rendering.
   * @param {string} url
   * @param {Object} options - { timeout, waitFor, extractImages }
   * @returns {Promise<{ html: string, text: string, title: string, images: Array, meta: Object }>}
   */
  async scrape(url, options = {}) { throw new Error("Not implemented"); }

  /**
   * Take a screenshot (not all engines support this).
   * @returns {Promise<Buffer|null>}
   */
  async screenshot(url) { return null; }

  /** Cleanup */
  async close() { this.connected = false; }

  /** Engine info for health checks */
  getStatus() {
    return { name: this.name, connected: this.connected };
  }
}

/**
 * Domains known to require JS rendering (SPAs).
 */
export const SPA_DOMAINS = [
  "x.com", "twitter.com",
  "notion.so",
  "linear.app",
  "figma.com",       // already handled by FigmaAdapter, but fallback
  "vercel.app",
  "app.slack.com",   // web client (API adapter is preferred)
  "github.com",      // mostly works without JS, but issues/PRs render dynamically
  "medium.com",
  "substack.com",
];

/**
 * Check if a URL likely needs a browser for proper rendering.
 */
export function needsBrowser(url) {
  try {
    const hostname = new URL(url).hostname;
    return SPA_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
