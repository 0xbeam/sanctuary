import { SlackAdapter } from "./slack-adapter.js";
import { TwitterAdapter } from "./twitter-adapter.js";
import { FigmaAdapter } from "./figma-adapter.js";
import { UrlAdapter } from "./url-adapter.js";

const ADAPTERS = [SlackAdapter, FigmaAdapter, TwitterAdapter, UrlAdapter];

/**
 * Auto-detect the right adapter for a URL.
 * Falls back to UrlAdapter if nothing else matches.
 */
export function detectAdapter(url) {
  const AdapterClass = ADAPTERS.find((A) => A.canHandle(url));
  return AdapterClass || UrlAdapter;
}

export { SlackAdapter, TwitterAdapter, FigmaAdapter, UrlAdapter };
export { ADAPTERS };
