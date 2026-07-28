import { Menu, Tray, nativeImage } from "electron";
import type { RecordScheduler } from "./scheduler/RecordScheduler";
import { logger } from "./logs/logger";

const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#26735b"/>
  <rect x="7" y="17" width="4" height="8" rx="1" fill="#ffffff"/>
  <rect x="14" y="11" width="4" height="14" rx="1" fill="#ffffff"/>
  <rect x="21" y="6" width="4" height="19" rx="1" fill="#ffffff"/>
</svg>`;

function trayIcon(): Electron.NativeImage {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString("base64")}`;
  const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
  if (!icon.isEmpty()) return icon;
  return nativeImage.createFromBuffer(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")).resize({ width: 16, height: 16 });
}

export function createTray(scheduler: RecordScheduler, showMainWindow: () => void): Tray | undefined {
  try {
    const tray = new Tray(trayIcon());
    tray.setToolTip("Activity Daily Client");
    tray.on("click", showMainWindow);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "\u6253\u5f00\u4e3b\u754c\u9762", click: showMainWindow },
      { type: "separator" },
      { label: "\u5f00\u59cb\u8bb0\u5f55", click: () => void scheduler.start() },
      { label: "\u6682\u505c", click: () => scheduler.pause() },
      { label: "\u505c\u6b62", click: () => scheduler.stop() },
      { type: "separator" },
      { role: "quit", label: "\u9000\u51fa" }
    ]));
    return tray;
  } catch (error) {
    logger.error("Unable to create system tray", error);
    return undefined;
  }
}
