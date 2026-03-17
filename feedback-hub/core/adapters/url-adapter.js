import { BaseAdapter } from "./base-adapter.js";
import { generateId } from "../types.js";

/**
 * Generic URL adapter — fetches a page and extracts text content.
 * Acts as the fallback adapter for any URL that doesn't match a specific source.
 */
export class UrlAdapter extends BaseAdapter {
  static sourceType = "url";

  static canHandle() {
    return true; // fallback — always matches
  }

  async scrape(url, options = {}) {
    const response = await fetch(url);
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
      meta: { url, statusCode: response.status },
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
    };
  }

  async downloadAssets(instructionSet, outputDir) {
    const { mkdir, writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const imagesDir = join(outputDir, "images");
    await mkdir(imagesDir, { recursive: true });

    const images = instructionSet.allEntries.flatMap((e) =>
      e.attachments.filter((a) => a.type === "image")
    );
    let downloaded = 0;

    for (const img of images) {
      try {
        const response = await fetch(img.url);
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(join(imagesDir, img.name), buffer);
        img.localPath = `images/${img.name}`;
        downloaded++;
      } catch {
        // skip
      }
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
    if (i >= 10) break; // limit to 10 images
    const src = match[1];
    if (src.startsWith("data:")) continue;
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
  }
  return imgs;
}
