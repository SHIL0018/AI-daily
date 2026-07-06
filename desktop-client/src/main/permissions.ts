import { systemPreferences } from "electron";

export function screenPermissionHint(): string {
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    return "请在系统设置中授予屏幕录制权限。";
  }
  return "";
}
