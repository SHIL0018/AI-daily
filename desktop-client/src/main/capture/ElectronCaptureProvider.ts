import { desktopCapturer, systemPreferences } from "electron";
import type { ActiveWindowInfo, PermissionStatus } from "../../shared/types";
import type { CapturedFrame, CaptureProvider } from "./CaptureProvider";

function perceptualHash(image: Electron.NativeImage): string | undefined {
  if (image.isEmpty()) return undefined;
  const size = 16;
  const resized = image.resize({ width: size, height: size, quality: "good" });
  const { width, height } = resized.getSize();
  const bitmap = resized.toBitmap();
  const pixels = width * height;
  if (pixels <= 0 || bitmap.length < pixels * 4) return undefined;

  const luminance: number[] = [];
  let total = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const blue = bitmap[offset] ?? 0;
    const green = bitmap[offset + 1] ?? 0;
    const red = bitmap[offset + 2] ?? 0;
    const value = red * 0.299 + green * 0.587 + blue * 0.114;
    luminance.push(value);
    total += value;
  }

  const average = total / luminance.length;
  let hash = "";
  for (let index = 0; index < luminance.length; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((luminance[index + bit] ?? 0) >= average) nibble |= 1 << (3 - bit);
    }
    hash += nibble.toString(16);
  }
  return hash;
}

function frameFromSource(source: Electron.DesktopCapturerSource, mode: CapturedFrame["source"]): CapturedFrame {
  const image = source.thumbnail;
  const size = image.getSize();
  return {
    frameId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    displayId: source.display_id,
    width: size.width,
    height: size.height,
    imageHash: perceptualHash(image),
    source: mode,
    encodeForModel: () => ({
      imageBase64: image.toJPEG(80).toString("base64"),
      imageMimeType: "image/jpeg"
    })
  };
}

export class ElectronCaptureProvider implements CaptureProvider {
  async checkPermission(): Promise<PermissionStatus> {
    if (process.platform === "darwin") {
      return systemPreferences.getMediaAccessStatus("screen") === "granted" ? "granted" : "denied";
    }
    return "unknown";
  }

  async capturePrimaryScreen(): Promise<CapturedFrame> {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
    if (!sources[0]) throw new Error("No screen source available");
    return frameFromSource(sources[0], "primary_monitor");
  }

  async captureActiveScreen(activeWindow: ActiveWindowInfo): Promise<CapturedFrame> {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
    const matched = activeWindow.displayId ? sources.find((source) => source.display_id === activeWindow.displayId) : undefined;
    const source = matched ?? sources[0];
    if (!source) throw new Error("No screen source available");
    return frameFromSource(source, "active_monitor");
  }
}
