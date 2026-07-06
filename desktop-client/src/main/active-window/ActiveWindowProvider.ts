import type { ActiveWindowInfo } from "../../shared/types";

export interface ActiveWindowProvider {
  getActiveWindow(): Promise<ActiveWindowInfo>;
}
