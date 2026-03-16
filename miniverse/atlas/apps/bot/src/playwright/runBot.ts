import { chromium, type Browser, type Page } from "playwright";
import { readFileSync, existsSync } from "fs";

interface BotConfig {
  meetUrl: string;
  botName: string;
  authCookiePath: string;
}

interface Segment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  source: string;
}

const EXIT_PHRASES = ["has left the meeting", "you've been removed", "the meeting has ended", "meeting ended for everyone"];
const JOIN_BUTTON_TEXTS = ["Join now", "Ask to join", "Join"];
const ADMITTED_SIGNALS = ["You've been admitted", "You're now in the meeting"];

export async function runBot(
  config: BotConfig,
  onSegments: (segments: Segment[]) => void,
  onMeetingEnd: () => Promise<void>
) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  // Load auth cookies if available
  if (existsSync(config.authCookiePath)) {
    const cookies = JSON.parse(readFileSync(config.authCookiePath, "utf-8"));
    await page.context().addCookies(cookies);
  }

  // Navigate to meet
  await page.goto(config.meetUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Mute mic and camera
  await muteMicAndCamera(page);

  // Set bot name
  await setBotName(page, config.botName);

  // Click join
  await clickJoinButton(page);

  // Wait for admission
  await waitForAdmission(page);

  // Enable captions
  await enableCaptions(page);

  // Setup caption scraping
  const meetingStart = Date.now();
  const captionBuffer: Segment[] = [];
  await setupCaptionScraping(page, meetingStart, captionBuffer);

  // Flush segments periodically
  const flushInterval = setInterval(() => {
    if (captionBuffer.length > 0) {
      onSegments([...captionBuffer]);
      captionBuffer.length = 0;
    }
  }, 10000);

  // Monitor meeting for exit conditions
  await monitorMeeting(page);

  clearInterval(flushInterval);

  // Flush remaining
  if (captionBuffer.length > 0) {
    onSegments([...captionBuffer]);
  }

  await browser.close();
  await onMeetingEnd();
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-web-security",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
}

async function muteMicAndCamera(page: Page) {
  // Try to click mute buttons before joining
  for (const label of ["Turn off microphone", "Turn off camera"]) {
    const btn = page.locator(`[aria-label="${label}"]`);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
    }
  }
}

async function setBotName(page: Page, name: string) {
  const nameInput = page.locator('input[aria-label="Your name"]');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(name);
  }
}

async function clickJoinButton(page: Page) {
  for (const text of JOIN_BUTTON_TEXTS) {
    const btn = page.locator(`button:has-text("${text}")`);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      return;
    }
  }
  // Fallback: click any join-like button
  await page.locator('button[data-is-muted]').first().click().catch(() => {});
}

async function waitForAdmission(page: Page) {
  const timeout = 120000; // 2 minutes
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (ADMITTED_SIGNALS.some((s) => text.includes(s))) return;
    // Check if we're already in the meeting (captions area visible)
    if (await page.locator('[class*="caption"]').first().isVisible().catch(() => false)) return;
    await page.waitForTimeout(2000);
  }
}

async function enableCaptions(page: Page) {
  // Try to turn on captions
  const ccButton = page.locator('[aria-label*="captions" i]').first();
  if (await ccButton.isVisible().catch(() => false)) {
    await ccButton.click();
    await page.waitForTimeout(1000);
  }
}

async function setupCaptionScraping(page: Page, meetingStart: number, buffer: Segment[]) {
  // Inject MutationObserver to capture captions
  await page.evaluate((startTime: number) => {
    const observer = new MutationObserver(() => {
      const captionElements = document.querySelectorAll('[class*="caption"], [class*="subtitle"]');
      captionElements.forEach((el) => {
        const text = el.textContent?.trim();
        if (!text) return;

        // Try to extract speaker name
        const parts = text.split(":");
        const speaker = parts.length > 1 ? parts[0].trim() : "Unknown";
        const content = parts.length > 1 ? parts.slice(1).join(":").trim() : text;

        const now = Date.now();
        (window as unknown as { __atlasSegments: Segment[] }).__atlasSegments = (window as unknown as { __atlasSegments: Segment[] }).__atlasSegments || [];
        (window as unknown as { __atlasSegments: Segment[] }).__atlasSegments.push({
          speaker,
          text: content,
          startMs: now - startTime,
          endMs: now - startTime + 1000,
          source: "captions",
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }, meetingStart);

  // Poll for new segments
  setInterval(async () => {
    const segments: Segment[] = await page.evaluate(() => {
      const segs = (window as unknown as { __atlasSegments: Segment[] }).__atlasSegments || [];
      (window as unknown as { __atlasSegments: Segment[] }).__atlasSegments = [];
      return segs;
    }).catch(() => []);

    if (segments.length > 0) {
      buffer.push(...segments);
    }
  }, 3000);
}

async function monitorMeeting(page: Page) {
  const MAX_DURATION = 4 * 60 * 60 * 1000; // 4 hours
  const start = Date.now();

  while (Date.now() - start < MAX_DURATION) {
    const text = await page.locator("body").innerText().catch(() => "");

    // Check exit conditions
    if (EXIT_PHRASES.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()))) {
      console.log("Meeting ended — exit phrase detected");
      return;
    }

    // Check participant count (leave if alone)
    const count = await getParticipantCount(page);
    if (count !== null && count <= 1) {
      console.log("Only bot remaining — leaving meeting");
      return;
    }

    await page.waitForTimeout(5000);
  }

  console.log("Max duration reached — leaving meeting");
}

async function getParticipantCount(page: Page): Promise<number | null> {
  // Try to find participant count in the UI
  const countEl = page.locator('[class*="participant"] [class*="count"], [aria-label*="participant"]').first();
  const text = await countEl.innerText().catch(() => "");
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}
