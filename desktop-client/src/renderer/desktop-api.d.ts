import type { ActivityRecord, AuthStatus, ClientSettings, RecorderStatus } from "../shared/types";

declare global {
  interface Window {
    desktop: {
      recorder: {
        start(): Promise<RecorderStatus>;
        pause(): Promise<RecorderStatus>;
        resume(): Promise<RecorderStatus>;
        stop(): Promise<RecorderStatus>;
        status(): Promise<RecorderStatus>;
      };
      model: { health(): Promise<unknown> };
      sync: { run(): Promise<unknown> };
      settings: {
        get(): Promise<ClientSettings & Record<string, unknown>>;
        update(patch: Partial<ClientSettings> & Record<string, unknown>): Promise<ClientSettings & Record<string, unknown>>;
      };
      records: { list(limit?: number): Promise<ActivityRecord[]>; clear(): Promise<void> };
      auth: {
        login(email: string, password: string): Promise<unknown>;
        registerDevice(): Promise<string>;
        status(): Promise<AuthStatus>;
        logout(): Promise<void>;
      };
      webReport: { open(): Promise<void> };
      logs: { openFolder(): Promise<void>; getPath(): Promise<string> };
    };
  }
}

export {};
