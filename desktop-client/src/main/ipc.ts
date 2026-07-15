import { ipcMain, shell } from "electron";
import { IPC } from "../shared/ipcChannels";
import type { ClientSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { ActivityRecordRepository } from "./storage/ActivityRecordRepository";
import { SettingsRepository } from "./storage/SettingsRepository";
import type { RecordScheduler } from "./scheduler/RecordScheduler";
import type { SyncService } from "./sync/SyncService";
import { clientLogPath, logsDir } from "./logs/logger";

export function registerIpcHandlers(options: {
  scheduler: RecordScheduler;
  syncService: SyncService;
  settingsRepository: SettingsRepository;
  records: ActivityRecordRepository;
}) {
  const { scheduler, syncService, settingsRepository, records } = options;

  ipcMain.handle(IPC.recorderStart, () => scheduler.start());
  ipcMain.handle(IPC.recorderPause, () => scheduler.pause());
  ipcMain.handle(IPC.recorderResume, () => scheduler.resume());
  ipcMain.handle(IPC.recorderStop, () => scheduler.stop());
  ipcMain.handle(IPC.recorderStatus, () => scheduler.status());
  ipcMain.handle(IPC.modelHealth, () => scheduler.healthCheck());
  ipcMain.handle(IPC.syncRun, () => syncService.syncOnce());
  ipcMain.handle(IPC.recordsList, (_event, limit?: number) => records.list(limit ?? 100));
  ipcMain.handle(IPC.recordsClear, () => records.clear());
  ipcMain.handle(IPC.settingsGet, () => settingsRepository.getAll());
  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Partial<ClientSettings> & Record<string, unknown>) => {
    if (!scheduler.canUpdateSettings()) throw new Error("正在记录时不能修改设置");
    for (const [key, value] of Object.entries(validateSettingsPatch(patch))) settingsRepository.set(key, value);
    return settingsRepository.getAll();
  });
  ipcMain.handle(IPC.authLogin, (_event, email: string, password: string) => syncService.login(email, password));
  ipcMain.handle(IPC.deviceRegister, () => syncService.registerDevice());
  ipcMain.handle(IPC.openWebReport, () => {
    const settings = settingsRepository.getAll();
    return shell.openExternal(settings.serverUrl);
  });
  ipcMain.handle(IPC.openLogsFolder, () => shell.openPath(logsDir));
  ipcMain.handle(IPC.getLogPath, () => clientLogPath);
}



const EDITABLE_SETTING_KEYS = new Set<keyof ClientSettings>([
  "captureIntervalSeconds",
  "idleThresholdSeconds",
  "multiMonitorMode",
  "maxImageLongEdge",
  "saveScreenshot",
  "uploadRawScreenshot",
  "uploadWindowTitle",
  "privacyAppBlacklist",
  "privacyTitleKeywords",
  "modelProvider",
  "modelBaseUrl",
  "modelName",
  "modelTimeoutSeconds",
  "serverUrl",
  "syncIntervalSeconds",
  "syncBatchSize",
  "maxRetryCount"
]);

function validateSettingsPatch(patch: Partial<ClientSettings> & Record<string, unknown>): Partial<ClientSettings> {
  const next: Partial<ClientSettings> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!EDITABLE_SETTING_KEYS.has(key as keyof ClientSettings)) throw new Error(`不允许修改设置项: ${key}`);
    switch (key as keyof ClientSettings) {
      case "captureIntervalSeconds": next.captureIntervalSeconds = boundedInt(value, DEFAULT_SETTINGS.minCaptureIntervalSeconds, DEFAULT_SETTINGS.maxCaptureIntervalSeconds, key); break;
      case "idleThresholdSeconds": next.idleThresholdSeconds = boundedInt(value, 30, 3600, key); break;
      case "maxImageLongEdge": next.maxImageLongEdge = boundedInt(value, 640, 3840, key); break;
      case "modelTimeoutSeconds": next.modelTimeoutSeconds = boundedInt(value, 5, 300, key); break;
      case "syncIntervalSeconds": next.syncIntervalSeconds = boundedInt(value, 10, 3600, key); break;
      case "syncBatchSize": next.syncBatchSize = boundedInt(value, 1, 500, key); break;
      case "maxRetryCount": next.maxRetryCount = boundedInt(value, 0, 20, key); break;
      case "saveScreenshot":
      case "uploadRawScreenshot":
      case "uploadWindowTitle":
        (next as Record<string, unknown>)[key] = booleanValue(value, key);
        break;
      case "privacyAppBlacklist":
      case "privacyTitleKeywords":
        (next as Record<string, unknown>)[key] = stringArray(value, key);
        break;
      case "multiMonitorMode":
        if (!["active_monitor", "primary_monitor", "all_monitors"].includes(String(value))) throw new Error(`设置项 ${key} 无效`);
        next.multiMonitorMode = value as ClientSettings["multiMonitorMode"];
        break;
      case "modelProvider":
        if (!["ollama", "local_http", "transformers"].includes(String(value))) throw new Error(`设置项 ${key} 无效`);
        next.modelProvider = value as ClientSettings["modelProvider"];
        break;
      case "modelBaseUrl":
      case "serverUrl":
        (next as Record<string, unknown>)[key] = httpUrl(value, key);
        break;
      case "modelName":
        next.modelName = nonEmptyString(value, key);
        break;
    }
  }
  return next;
}

function boundedInt(value: unknown, min: number, max: number, key: string): number {
  if (!Number.isInteger(value)) throw new Error(`设置项 ${key} 必须是整数`);
  const numberValue = value as number;
  if (numberValue < min || numberValue > max) throw new Error(`设置项 ${key} 必须在 ${min}-${max} 之间`);
  return numberValue;
}

function booleanValue(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new Error(`设置项 ${key} 必须是布尔值`);
  return value;
}

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`设置项 ${key} 必须是字符串数组`);
  return value.map((item) => item.trim()).filter(Boolean);
}

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`设置项 ${key} 必须是非空字符串`);
  return value.trim();
}

function httpUrl(value: unknown, key: string): string {
  const text = nonEmptyString(value, key);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`设置项 ${key} 必须是有效 URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`设置项 ${key} 只允许 http/https`);
  return text.replace(/\/$/, "");
}
