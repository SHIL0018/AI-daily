import { app, BrowserWindow, dialog, Menu } from "electron";
import { createMainWindow } from "./window";
import { createTray } from "./tray";
import { registerIpcHandlers } from "./ipc";
import { LocalDatabase } from "./storage/LocalDatabase";
import { SettingsRepository } from "./storage/SettingsRepository";
import { ActivityRecordRepository } from "./storage/ActivityRecordRepository";
import { SessionRepository } from "./storage/SessionRepository";
import { PrivacyService } from "./privacy/PrivacyService";
import { ElectronCaptureProvider } from "./capture/ElectronCaptureProvider";
import { CaptureService } from "./capture/CaptureService";
import { CrossPlatformActiveWindowProvider } from "./active-window/CrossPlatformActiveWindowProvider";
import { ActiveWindowService } from "./active-window/ActiveWindowService";
import { OllamaAdapter } from "./model-adapter/OllamaAdapter";
import { LocalHttpAdapter } from "./model-adapter/LocalHttpAdapter";
import { OpenAiCompatibleAdapter } from "./model-adapter/OpenAiCompatibleAdapter";
import type { ClientSettings } from "../shared/types";
import { IdleDetector } from "./scheduler/IdleDetector";
import { RecordScheduler } from "./scheduler/RecordScheduler";
import { SyncQueue } from "./sync/SyncQueue";
import { SyncService } from "./sync/SyncService";
import { errorMessage, logger } from "./logs/logger";
import { RuntimeBootstrap } from "./runtime/RuntimeBootstrap";

let mainWindow: BrowserWindow | undefined;
let isQuitting = false;

app.disableHardwareAcceleration();
Menu.setApplicationMenu(null);

function showMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    attachClosePrompt(mainWindow);
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

function attachClosePrompt(window: BrowserWindow, scheduler?: RecordScheduler): void {
  window.on("close", (event) => {
    if (isQuitting) return;

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: "Activity Daily Client",
      message: "\u5173\u95ed\u7a97\u53e3\u540e\u8981\u7ee7\u7eed\u5728\u540e\u53f0\u8fd0\u884c\u5417\uff1f",
      detail: "\u9009\u62e9\u201c\u540e\u53f0\u8fd0\u884c\u201d\u540e\uff0c\u53ef\u4ee5\u4ece\u7cfb\u7edf\u6258\u76d8\u91cd\u65b0\u6253\u5f00\u4e3b\u754c\u9762\u3002",
      buttons: ["\u540e\u53f0\u8fd0\u884c", "\u76f4\u63a5\u9000\u51fa", "\u53d6\u6d88"],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    });

    if (choice === 0) {
      window.hide();
      return;
    }

    if (choice === 1) {
      isQuitting = true;
      scheduler?.stop();
      app.quit();
    }
  });
}

app.whenReady().then(() => {
  const database = new LocalDatabase();
  const settingsRepository = new SettingsRepository(database);
  settingsRepository.seedDefaults();
  const records = new ActivityRecordRepository(database);
  const sessions = new SessionRepository(database);
  const privacy = new PrivacyService();
  const capture = new CaptureService(new ElectronCaptureProvider());
  const activeWindow = new ActiveWindowService(new CrossPlatformActiveWindowProvider());
  const queue = new SyncQueue(database);
  const syncService = new SyncService(settingsRepository, records, privacy, queue);
  const modelAdapterFactory = (settings: ClientSettings) => {
    if (settings.modelProvider === "local_http") return new LocalHttpAdapter(settings);
    if (settings.modelProvider === "transformers") return new OpenAiCompatibleAdapter(settings);
    return new OllamaAdapter(settings);
  };
  const scheduler = new RecordScheduler(settingsRepository, records, sessions, activeWindow, capture, privacy, modelAdapterFactory, new IdleDetector(), syncService);

  const runtimeBootstrap = new RuntimeBootstrap(settingsRepository);
  void runtimeBootstrap.ensure().then(() => scheduler.healthCheck()).catch((error) => logger.error("Runtime bootstrap failed", errorMessage(error)));

  syncService.startAutoSync();
  registerIpcHandlers({ scheduler, syncService, settingsRepository, records });
  mainWindow = createMainWindow();
  attachClosePrompt(mainWindow, scheduler);
  createTray(scheduler, showMainWindow);
  void scheduler.healthCheck();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => logger.error("Uncaught exception", errorMessage(error)));
process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", errorMessage(reason)));