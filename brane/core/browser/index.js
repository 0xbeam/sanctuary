import { CloudflareEngine } from "./cloudflare.js";
import { LightpandaEngine } from "./lightpanda.js";
import { needsBrowser } from "./engine.js";

/**
 * BrowserManager — manages the fallback chain of browser engines.
 *
 * Priority:
 * 1. Cloudflare Browser Rendering (production, edge-powered)
 * 2. Lightpanda / local CDP (dev, self-hosted)
 * 3. null (graceful fallback to plain fetch)
 */
export class BrowserManager {
  constructor() {
    this.engines = [];
    this.activeEngine = null;
    this._initialized = false;
  }

  /**
   * Initialize — detect available engines and connect.
   * Non-destructive: if no engines available, returns gracefully.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // Register engines in priority order
    const candidates = [
      new CloudflareEngine(),
      new LightpandaEngine(),
    ];

    for (const engine of candidates) {
      const available = await engine.isAvailable();
      if (available) {
        this.engines.push(engine);
        console.log(`  ✓ Browser engine available: ${engine.name}`);
      }
    }

    // Connect to the first available engine
    if (this.engines.length > 0) {
      try {
        await this.engines[0].connect();
        this.activeEngine = this.engines[0];
        console.log(`  ⚡ Active browser engine: ${this.activeEngine.name}`);
      } catch (err) {
        console.warn(`  ⚠ Failed to connect to ${this.engines[0].name}: ${err.message}`);
        // Try next engine
        if (this.engines.length > 1) {
          try {
            await this.engines[1].connect();
            this.activeEngine = this.engines[1];
            console.log(`  ⚡ Fallback browser engine: ${this.activeEngine.name}`);
          } catch (err2) {
            console.warn(`  ⚠ Failed to connect to ${this.engines[1].name}: ${err2.message}`);
          }
        }
      }
    } else {
      console.log("  ℹ No browser engines available — using plain fetch");
    }
  }

  /**
   * Check if browser scraping is available.
   */
  isAvailable() {
    return !!this.activeEngine?.connected;
  }

  /**
   * Check if a URL should use browser rendering.
   */
  shouldUseBrowser(url) {
    return this.isAvailable() && needsBrowser(url);
  }

  /**
   * Scrape a URL using the active browser engine.
   * Falls through the engine chain on failure.
   *
   * @returns {Promise<{ html, text, title, images, meta } | null>}
   */
  async scrape(url, options = {}) {
    if (!this.isAvailable()) return null;

    // Try active engine first
    try {
      return await this.activeEngine.scrape(url, options);
    } catch (err) {
      console.warn(`Browser scrape failed (${this.activeEngine.name}): ${err.message}`);

      // Try fallback engines
      for (const engine of this.engines) {
        if (engine === this.activeEngine) continue;
        if (!engine.connected) {
          try { await engine.connect(); } catch { continue; }
        }
        try {
          const result = await engine.scrape(url, options);
          this.activeEngine = engine; // Switch to working engine
          return result;
        } catch {
          continue;
        }
      }

      return null; // All engines failed — caller should fallback to fetch
    }
  }

  /**
   * Get status of all engines for the Settings page.
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      activeEngine: this.activeEngine?.name || null,
      engines: this.engines.map((e) => e.getStatus()),
    };
  }

  /**
   * Shutdown all engines.
   */
  async shutdown() {
    for (const engine of this.engines) {
      await engine.close().catch(() => {});
    }
    this.activeEngine = null;
  }
}

// Singleton — shared across the server
let _instance = null;

export function getBrowserManager() {
  if (!_instance) {
    _instance = new BrowserManager();
  }
  return _instance;
}

export { needsBrowser } from "./engine.js";
export { CloudflareEngine } from "./cloudflare.js";
export { LightpandaEngine } from "./lightpanda.js";
