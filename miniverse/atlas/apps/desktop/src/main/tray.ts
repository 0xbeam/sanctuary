import { Tray, Menu, nativeImage } from "electron";
import path from "path";

interface TrayActions {
  onToggleWindow: () => void;
  onToggleTracking: () => boolean;
  onQuit: () => void;
  isTracking: () => boolean;
}

let tray: Tray | null = null;

export function createTray(actions: TrayActions) {
  // Create a simple 16x16 tray icon (circle dot)
  const icon = nativeImage.createFromBuffer(createTrayIcon());
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Atlas — AI Work Assistant");

  const updateMenu = () => {
    const tracking = actions.isTracking();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Atlas",
        click: actions.onToggleWindow,
      },
      { type: "separator" },
      {
        label: tracking ? "Pause Context Tracking" : "Resume Context Tracking",
        click: () => {
          actions.onToggleTracking();
          updateMenu();
        },
      },
      {
        label: `Status: ${tracking ? "Tracking" : "Paused"}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Quit Atlas",
        click: actions.onQuit,
      },
    ]);

    tray?.setContextMenu(contextMenu);
  };

  tray.on("click", actions.onToggleWindow);
  updateMenu();

  return tray;
}

// Generate a minimal tray icon as a PNG buffer (16x16 white circle)
function createTrayIcon(): Buffer {
  // Minimal 16x16 PNG with a simple "A" shape
  // Using a pre-computed tiny PNG for the tray icon
  // In production, replace with a proper .png in resources/
  const size = 16;
  const channels = 4; // RGBA

  // Create raw pixel data for a simple "A" letter icon
  const pixels = Buffer.alloc(size * size * channels, 0);

  // Draw a simple diamond/dot shape
  const cx = 8, cy = 8, r = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        const idx = (y * size + x) * channels;
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = dist <= r - 1.5 ? 255 : Math.round(255 * (r - dist) / 1.5); // A
      }
    }
  }

  return nativeImage.createFromBuffer(pixels, { width: size, height: size }).toPNG();
}
