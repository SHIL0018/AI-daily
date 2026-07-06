import { ipcMain, shell } from "electron";
import { IPC } from "../shared/ipcChannels";
import type { ClientSettings } from "../shared/types";
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
    for (const [key, value] of Object.entries(patch)) settingsRepository.set(key, value);
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

