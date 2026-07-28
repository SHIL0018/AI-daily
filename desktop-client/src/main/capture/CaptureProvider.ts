import type { ActiveWindowInfo, CaptureFrame, PermissionStatus } from "../../shared/types";

export type EncodedCaptureImage = {
  imageBase64: string;
  imageMimeType: "image/jpeg" | "image/png";
};

export type CapturedFrame = Omit<CaptureFrame, "imageBase64" | "imageMimeType" | "imageBuffer"> & {
  encodeForModel(): EncodedCaptureImage;
};

export interface CaptureProvider {
  checkPermission(): Promise<PermissionStatus>;
  capturePrimaryScreen(): Promise<CapturedFrame>;
  captureActiveScreen(activeWindow: ActiveWindowInfo): Promise<CapturedFrame>;
}
