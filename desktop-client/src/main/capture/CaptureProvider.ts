import type { ActiveWindowInfo, CaptureFrame, PermissionStatus } from "../../shared/types";

export interface CaptureProvider {
  checkPermission(): Promise<PermissionStatus>;
  capturePrimaryScreen(): Promise<CaptureFrame>;
  captureActiveScreen(activeWindow: ActiveWindowInfo): Promise<CaptureFrame>;
}
