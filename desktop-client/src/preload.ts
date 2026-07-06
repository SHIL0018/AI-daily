import { contextBridge, ipcRenderer } from "electron";
import type { ClientSettings } from "./shared/types";

const IPC = {
  recorderStart: "recorder:start",
  recorderPause: "recorder:pause",
  recorderResume: "recorder:resume",
  recorderStop: "recorder:stop",
  recorderStatus: "recorder:status",
  modelHealth: "model:health",
  syncRun: "sync:run",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  recordsList: "records:list",
  recordsClear: "records:clear",
  authLogin: "auth:login",
  deviceRegister: "device:register",
  openWebReport: "web-report:open",
  openLogsFolder: "logs:open-folder",
  getLogPath: "logs:get-path"
} as const;

const api = {
  recorder: {
    start: () => ipcRenderer.invoke(IPC.recorderStart),
    pause: () => ipcRenderer.invoke(IPC.recorderPause),
    resume: () => ipcRenderer.invoke(IPC.recorderResume),
    stop: () => ipcRenderer.invoke(IPC.recorderStop),
    status: () => ipcRenderer.invoke(IPC.recorderStatus)
  },
  model: {
    health: () => ipcRenderer.invoke(IPC.modelHealth)
  },
  sync: {
    run: () => ipcRenderer.invoke(IPC.syncRun)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<ClientSettings> & Record<string, unknown>) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  records: {
    list: (limit?: number) => ipcRenderer.invoke(IPC.recordsList, limit),
    clear: () => ipcRenderer.invoke(IPC.recordsClear)
  },
  auth: {
    login: (email: string, password: string) => ipcRenderer.invoke(IPC.authLogin, email, password),
    registerDevice: () => ipcRenderer.invoke(IPC.deviceRegister)
  },
  webReport: {
    open: () => ipcRenderer.invoke(IPC.openWebReport)
  },
  logs: {
    openFolder: () => ipcRenderer.invoke(IPC.openLogsFolder),
    getPath: () => ipcRenderer.invoke(IPC.getLogPath)
  }
};

contextBridge.exposeInMainWorld("desktop", api);

export type DesktopApi = typeof api;