import { Menu, Tray, nativeImage } from "electron";
import type { RecordScheduler } from "./scheduler/RecordScheduler";

export function createTray(scheduler: RecordScheduler, showMainWindow: () => void): Tray {
  const icon = nativeImage.createEmpty();
  const tray = new Tray(icon);
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
}