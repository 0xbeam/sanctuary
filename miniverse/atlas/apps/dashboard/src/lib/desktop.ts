// Bridge to Electron desktop app (available when running inside Atlas desktop)

interface AtlasDesktopBridge {
  getTrackingStatus: () => Promise<boolean>;
  toggleTracking: () => Promise<boolean>;
  getContextStats: () => Promise<{
    totalEvents: number;
    unsyncedEvents: number;
    todayEvents: number;
    topApps: { app: string; minutes: number; switches: number }[];
  } | null>;
  getRecentContext: (limit: number) => Promise<unknown[]>;
  platform: string;
  isDesktop: true;
}

declare global {
  interface Window {
    atlas?: AtlasDesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.atlas?.isDesktop;
}

export function getDesktopBridge(): AtlasDesktopBridge | null {
  if (typeof window !== "undefined" && window.atlas) return window.atlas;
  return null;
}
