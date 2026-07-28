import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { app } from "electron";

let logsDir: string | undefined;
let clientLogPath: string | undefined;

log.transports.file.level = false;
log.transports.console.level = "debug";

export function configureLogger(): void {
  try {
    logsDir = app.getPath("logs");
    clientLogPath = path.join(logsDir, "client.log");
    fs.mkdirSync(logsDir, { recursive: true });
    log.transports.file.resolvePathFn = () => clientLogPath!;
    log.transports.file.level = "info";
  } catch (error) {
    log.transports.file.level = false;
    console.error("Unable to initialize file logging", error);
  }
}

export function getLogsDir(): string {
  return logsDir ?? app.getPath("logs");
}

export function getClientLogPath(): string {
  return clientLogPath ?? path.join(getLogsDir(), "client.log");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  return String(error);
}

export const logger = log;
