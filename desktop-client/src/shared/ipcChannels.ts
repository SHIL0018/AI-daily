export const IPC = {
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
