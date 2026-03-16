import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export interface ContextEvent {
  id: string;
  timestamp: string;
  appName: string;
  bundleId: string | null;
  windowTitle: string | null;
  browserUrl: string | null;
  tabTitle: string | null;
  durationSecs: number | null;
}

// AppleScript to get active window info
const ACTIVE_WINDOW_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set bundleId to bundle identifier of frontApp
  try
    set winTitle to name of front window of frontApp
  on error
    set winTitle to ""
  end try
  return appName & "|||" & bundleId & "|||" & winTitle
end tell
`;

// AppleScript to get Chrome/Arc/Brave tab URL
const BROWSER_URL_SCRIPT = (browser: string) => `
tell application "${browser}"
  try
    set tabUrl to URL of active tab of front window
    set tabTitle to title of active tab of front window
    return tabUrl & "|||" & tabTitle
  on error
    return "|||"
  end try
end tell
`;

const CHROMIUM_BROWSERS = ["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge", "Chromium"];
const SAFARI_URL_SCRIPT = `
tell application "Safari"
  try
    set tabUrl to URL of current tab of front window
    set tabTitle to name of current tab of front window
    return tabUrl & "|||" & tabTitle
  on error
    return "|||"
  end try
end tell
`;

export class WindowTracker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastEvent: { appName: string; windowTitle: string; timestamp: number } | null = null;
  private _isRunning = false;
  private eventCounter = 0;

  constructor(private onEvent: (event: ContextEvent) => void) {}

  get isRunning() {
    return this._isRunning;
  }

  start(pollMs = 5000) {
    if (this.interval) return;
    this._isRunning = true;
    this.interval = setInterval(() => this.poll(), pollMs);
    this.poll(); // Immediate first poll
    console.log("Window tracker started");
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Finalize duration of last event
    if (this.lastEvent) {
      this.lastEvent = null;
    }
    this._isRunning = false;
    console.log("Window tracker stopped");
  }

  private async poll() {
    try {
      const { appName, bundleId, windowTitle } = await this.getActiveWindow();
      if (!appName) return;

      const now = Date.now();

      // Deduplicate — only emit on transitions
      if (
        this.lastEvent &&
        this.lastEvent.appName === appName &&
        this.lastEvent.windowTitle === windowTitle
      ) {
        return;
      }

      // Compute duration for the previous event
      let durationSecs: number | null = null;
      if (this.lastEvent) {
        durationSecs = Math.round((now - this.lastEvent.timestamp) / 1000);
      }

      // Get browser URL if applicable
      let browserUrl: string | null = null;
      let tabTitle: string | null = null;

      if (CHROMIUM_BROWSERS.includes(appName)) {
        const browser = await this.getBrowserUrl(appName);
        browserUrl = browser.url;
        tabTitle = browser.title;
      } else if (appName === "Safari") {
        const browser = await this.getSafariUrl();
        browserUrl = browser.url;
        tabTitle = browser.title;
      }

      // Emit the previous event with its duration (if any)
      // Emit new event
      const event: ContextEvent = {
        id: `${now}-${this.eventCounter++}`,
        timestamp: new Date(now).toISOString(),
        appName,
        bundleId,
        windowTitle,
        browserUrl,
        tabTitle,
        durationSecs,
      };

      this.lastEvent = { appName, windowTitle: windowTitle || "", timestamp: now };
      this.onEvent(event);
    } catch (err) {
      // Silently fail — poll will retry
    }
  }

  private async getActiveWindow(): Promise<{
    appName: string;
    bundleId: string | null;
    windowTitle: string | null;
  }> {
    try {
      const { stdout } = await exec("osascript", ["-e", ACTIVE_WINDOW_SCRIPT], {
        timeout: 3000,
      });
      const [appName, bundleId, windowTitle] = stdout.trim().split("|||");
      return {
        appName: appName || "",
        bundleId: bundleId || null,
        windowTitle: windowTitle || null,
      };
    } catch {
      return { appName: "", bundleId: null, windowTitle: null };
    }
  }

  private async getBrowserUrl(browser: string): Promise<{ url: string | null; title: string | null }> {
    try {
      const { stdout } = await exec("osascript", ["-e", BROWSER_URL_SCRIPT(browser)], {
        timeout: 2000,
      });
      const [url, title] = stdout.trim().split("|||");
      return { url: url || null, title: title || null };
    } catch {
      return { url: null, title: null };
    }
  }

  private async getSafariUrl(): Promise<{ url: string | null; title: string | null }> {
    try {
      const { stdout } = await exec("osascript", ["-e", SAFARI_URL_SCRIPT], {
        timeout: 2000,
      });
      const [url, title] = stdout.trim().split("|||");
      return { url: url || null, title: title || null };
    } catch {
      return { url: null, title: null };
    }
  }
}
