import type { ActiveWindowInfo, CaptureFrame, ClientSettings } from "../../shared/types";
import type { CaptureProvider } from "./CaptureProvider";

export class CaptureService {
  constructor(private readonly provider: CaptureProvider) {}

  checkPermission() {
    return this.provider.checkPermission();
  }

  capture(settings: ClientSettings, activeWindow: ActiveWindowInfo): Promise<CaptureFrame> {
    if (settings.multiMonitorMode === "primary_monitor") return this.provider.capturePrimaryScreen();
    return this.provider.captureActiveScreen(activeWindow);
  }
}
