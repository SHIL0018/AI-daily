import type { AuthStatus } from "../shared/types";

export function canAutoEnterDashboard(status: AuthStatus): boolean {
  return status.hasSession && status.serverReachable;
}

export function canOfferOfflineAccess(status: AuthStatus): boolean {
  return status.canUseOffline && !status.serverReachable;
}
