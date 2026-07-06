import { powerMonitor } from "electron";

export interface IdleState {
  isIdle: boolean;
  idleSeconds: number;
  changedAt: string;
}

export class IdleDetector {
  getState(thresholdSeconds: number): IdleState {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    return { isIdle: idleSeconds >= thresholdSeconds, idleSeconds, changedAt: new Date().toISOString() };
  }
}
