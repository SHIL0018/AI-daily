import type { ActiveWindowInfo } from "../../shared/types";
import { errorMessage, logger } from "../logs/logger";
import type { ActiveWindowProvider } from "./ActiveWindowProvider";

export class ActiveWindowService {
  constructor(private readonly provider: ActiveWindowProvider) {}

  async getActiveWindow(): Promise<ActiveWindowInfo> {
    try {
      const active = await this.provider.getActiveWindow();
      if (!active.appName && !active.windowTitle) logger.warn("Active window provider returned empty result", active);
      return active;
    } catch (error) {
      logger.warn("Active window capture failed", errorMessage(error));
      return { capturedAt: new Date().toISOString() };
    }
  }
}