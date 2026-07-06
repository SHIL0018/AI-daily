import fs from "node:fs";
import path from "node:path";
import log from "electron-log";

export const logsDir = path.join(process.cwd(), "logs");
export const clientLogPath = path.join(logsDir, "client.log");

fs.mkdirSync(logsDir, { recursive: true });

log.transports.file.level = "info";
log.transports.console.level = "debug";
log.transports.file.resolvePathFn = () => clientLogPath;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  return String(error);
}

export const logger = log;