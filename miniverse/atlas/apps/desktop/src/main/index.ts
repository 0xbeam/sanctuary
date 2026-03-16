import { app, BrowserWindow, ipcMain, systemPreferences, Notification } from "electron";
import path from "path";
import { createTray } from "./tray";
import { WindowTracker } from "./window-tracker";
import { ContextStore } from "./context-store";

const DASHBOARD_URL = process.env.ATLAS_DASHBOARD_URL || "http://localhost:3088";
const BACKEND_URL = process.env.ATLAS_BACKEND_URL || "http://localhost:3001";

let mainWindow: BrowserWindow | null = null;
let tracker: WindowTracker | null = null;
let store: ContextStore | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(DASHBOARD_URL);

  mainWindow.on("close", (e) => {
    // Hide instead of quit when closing window
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Extend app type for our custom property
declare module "electron" {
  interface App {
    isQuitting: boolean;
  }
}
app.isQuitting = false;

app.whenReady().then(async () => {
  // Check accessibility permission (needed for window tracking)
  if (process.platform === "darwin") {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (!trusted) {
      new Notification({
        title: "Atlas needs Accessibility access",
        body: "Open System Preferences > Privacy & Security > Accessibility and enable Atlas.",
      }).show();
    }
  }

  // Initialize context store (local SQLite)
  store = new ContextStore();

  // Start window tracker
  tracker = new WindowTracker((event) => {
    store?.insert(event);
  });
  tracker.start();

  // Start sync loop to backend
  startSyncLoop();

  // Create tray
  createTray({
    onToggleWindow: () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        if (!mainWindow) createWindow();
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    onToggleTracking: () => {
      if (tracker?.isRunning) {
        tracker.stop();
      } else {
        tracker?.start();
      }
      return tracker?.isRunning ?? false;
    },
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
    isTracking: () => tracker?.isRunning ?? false,
  });

  // Create window
  createWindow();

  // IPC handlers
  ipcMain.handle("get-tracking-status", () => tracker?.isRunning ?? false);
  ipcMain.handle("toggle-tracking", () => {
    if (tracker?.isRunning) {
      tracker.stop();
    } else {
      tracker?.start();
    }
    return tracker?.isRunning ?? false;
  });
  ipcMain.handle("get-context-stats", () => store?.getStats() ?? null);
  ipcMain.handle("get-recent-context", (_e, limit: number) => store?.getRecent(limit) ?? []);
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
  mainWindow?.show();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  tracker?.stop();
  // Final sync before quitting
  syncToBackend().catch(() => {});
});

// ─── Backend Sync ───

let lastSyncedAt = 0;

async function syncToBackend() {
  if (!store) return;

  const events = store.getUnsyncedSince(lastSyncedAt, 100);
  if (events.length === 0) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/context/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });

    if (res.ok) {
      const result = await res.json();
      lastSyncedAt = Date.now();
      store.markSynced(events.map((e) => e.id));
      console.log(`Synced ${result.ingested} context events to backend`);
    }
  } catch {
    // Backend not available — will retry next cycle
  }
}

function startSyncLoop() {
  // Sync every 60 seconds
  setInterval(syncToBackend, 60_000);
  // Initial sync after 10 seconds
  setTimeout(syncToBackend, 10_000);
}
