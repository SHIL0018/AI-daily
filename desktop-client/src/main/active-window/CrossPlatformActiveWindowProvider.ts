import type { ActiveWindowInfo } from "../../shared/types";
import { toShanghaiIso } from "../../shared/time";
import type { ActiveWindowProvider } from "./ActiveWindowProvider";

type ActiveWinInfo = {
  title?: string;
  id?: number | string;
  owner?: { name?: string; processId?: number; path?: string };
  platform?: string;
  bounds?: unknown;
};

type ActiveWinModule = {
  activeWindow?: () => Promise<ActiveWinInfo | undefined | null>;
  default?: () => Promise<ActiveWinInfo | undefined | null>;
};

export class CrossPlatformActiveWindowProvider implements ActiveWindowProvider {
  async getActiveWindow(): Promise<ActiveWindowInfo> {
    const loader = Function("return import('active-win')") as () => Promise<ActiveWinModule>;
    const mod = await loader();
    const getActiveWindow = mod.activeWindow ?? mod.default;
    if (!getActiveWindow) throw new Error("active-win does not expose activeWindow");
    const info = await getActiveWindow();
    return {
      appName: info?.owner?.name,
      processName: info?.owner?.processId ? String(info.owner.processId) : undefined,
      windowTitle: info?.title,
      windowId: info?.id ? String(info.id) : undefined,
      capturedAt: toShanghaiIso()
    };
  }
}

