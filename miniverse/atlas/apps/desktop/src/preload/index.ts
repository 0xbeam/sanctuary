import { contextBridge, ipcRenderer } from "electron";

// Expose safe APIs to the renderer (dashboard) via window.atlas
contextBridge.exposeInMainWorld("atlas", {
  // Context tracking
  getTrackingStatus: () => ipcRenderer.invoke("get-tracking-status"),
  toggleTracking: () => ipcRenderer.invoke("toggle-tracking"),
  getContextStats: () => ipcRenderer.invoke("get-context-stats"),
  getRecentContext: (limit: number) => ipcRenderer.invoke("get-recent-context", limit),

  // Platform info
  platform: process.platform,
  isDesktop: true,
});
