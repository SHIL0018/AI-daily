import os from "node:os";
import type { AuthStatus, ClientSettings, SyncResult, SyncStatus } from "../../shared/types";
import { ActivityRecordRepository } from "../storage/ActivityRecordRepository";
import { SettingsRepository } from "../storage/SettingsRepository";
import { PrivacyService } from "../privacy/PrivacyService";
import { ApiClient, ApiRequestError } from "./ApiClient";
import { SyncQueue } from "./SyncQueue";

type UploadResult = SyncResult & { results: Array<{ client_record_id: string; server_record_id?: string; status: string; error?: string }> };

const EMPTY_SYNC_RESULT: UploadResult = { accepted: 0, duplicated: 0, failed: 0, results: [] };

export class SyncService {
  private timer?: NodeJS.Timeout;
  private pendingTimer?: NodeJS.Timeout;
  private currentSync?: Promise<UploadResult>;
  private lastSyncAt?: string;
  private lastError?: string;
  private readonly listeners = new Set<() => void>();
  private consecutiveTemporaryFailures = 0;
  private nextAutoSyncAt = 0;
  private readonly maxBackoffMs = 30 * 60 * 1000;

  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly records: ActivityRecordRepository,
    private readonly privacy: PrivacyService,
    private readonly queue: SyncQueue
  ) {}

  startAutoSync(): void {
    const settings = this.settingsRepository.getAll();
    this.stopAutoSync();
    this.scheduleAutoSync(settings.syncIntervalSeconds * 1000);
  }

  stopAutoSync(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.timer = undefined;
    this.pendingTimer = undefined;
  }

  requestSyncSoon(delayMs = 5000): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    const effectiveDelay = Math.max(delayMs, this.nextAutoSyncAt - Date.now());
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      void this.syncOnce(false).catch(() => undefined);
    }, effectiveDelay);
  }

  status(counts = this.records.countByUploadStatus()): SyncStatus {
    return {
      pending: counts.pending,
      failed: counts.failed,
      synced: counts.synced,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login(email: string, password: string) {
    const api = this.createApiClient();
    const result = await api.login(email, password);
    this.settingsRepository.set("accessToken", result.accessToken);
    this.settingsRepository.set("refreshToken", result.refreshToken);
    this.settingsRepository.set("accountEmail", email.trim());
    return result;
  }

  async authStatus(): Promise<AuthStatus> {
    const settings = this.settingsRepository.getAll();
    const refreshToken = this.settingsRepository.get<string>("refreshToken", "");
    const deviceId = this.settingsRepository.get<string>("deviceId", "");
    const email = this.settingsRepository.get<string>("accountEmail", "");
    const canUseOffline = Boolean(refreshToken && deviceId);
    let serverReachable = false;
    try {
      const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(3000) });
      serverReachable = response.ok;
    } catch {
      serverReachable = false;
    }
    return { hasSession: canUseOffline, canUseOffline, serverReachable, email: email || undefined };
  }

  logout(): void {
    this.settingsRepository.set("accessToken", "");
    this.settingsRepository.set("refreshToken", "");
    this.settingsRepository.set("deviceId", "");
    this.settingsRepository.set("accountEmail", "");
  }

  async registerDevice(): Promise<string> {
    const api = this.createApiClient();
    const deviceId = await api.registerDevice(os.hostname(), os.platform(), os.release());
    this.settingsRepository.set("deviceId", deviceId);
    return deviceId;
  }

  async syncOnce(manual = true): Promise<UploadResult> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    if (this.currentSync) return this.currentSync;
    if (!manual && Date.now() < this.nextAutoSyncAt) return EMPTY_SYNC_RESULT;
    const task = this.runSyncOnce();
    this.currentSync = task;
    try {
      const result = await task;
      if (manual) this.scheduleAutoSync(this.settingsRepository.getAll().syncIntervalSeconds * 1000);
      return result;
    } finally {
      if (this.currentSync === task) this.currentSync = undefined;
    }
  }

  async retryFailedRecords(): Promise<{ restored: number; sync: UploadResult }> {
    const restored = this.records.retryFailed();
    this.notifyChanged();
    const sync = restored > 0 ? await this.syncOnce(true) : EMPTY_SYNC_RESULT;
    return { restored, sync };
  }

  private async runSyncOnce(): Promise<UploadResult> {
    const settings = this.settingsRepository.getAll();
    const deviceId = this.settingsRepository.get<string>("deviceId");
    const token = this.settingsRepository.get<string>("accessToken");
    const refreshToken = this.settingsRepository.get<string>("refreshToken");
    if (!deviceId || (!token && !refreshToken)) return EMPTY_SYNC_RESULT;
    const batch = this.records.listForSync(settings.syncBatchSize, settings.maxRetryCount).map((record) => this.privacy.sanitizeBeforeUpload(record, settings));
    if (!batch.length) return EMPTY_SYNC_RESULT;
    const syncId = this.queue.start();
    this.records.markUploading(batch);
    this.notifyChanged();
    try {
      const api = this.createApiClient(settings);
      const result = await api.uploadRecords(deviceId, batch);
      for (const item of result.results) {
        if (item.status === "accepted" || item.status === "duplicated") this.records.markSynced(item.client_record_id, item.server_record_id);
        else this.records.markFailed(item.client_record_id, item.error ?? "sync failed");
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = undefined;
      this.resetBackoff();
      this.queue.finish(syncId, result.accepted + result.duplicated, result.failed);
      this.notifyChanged();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      if (error instanceof ApiRequestError && error.category === "permanent") {
        batch.forEach((record) => this.records.markFailed(record.id, message));
      } else {
        this.records.restorePending(batch, message);
        this.registerTemporaryFailure(settings.syncIntervalSeconds * 1000);
      }
      this.queue.fail(syncId, message);
      this.notifyChanged();
      throw error;
    }
  }

  private createApiClient(settings: ClientSettings = this.settingsRepository.getAll()): ApiClient {
    return new ApiClient(
      settings,
      () => this.settingsRepository.get<string>("accessToken"),
      () => this.settingsRepository.get<string>("refreshToken"),
      (token) => this.settingsRepository.set("accessToken", token)
    );
  }

  private scheduleAutoSync(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.syncOnce(false)
        .catch(() => undefined)
        .finally(() => this.scheduleAutoSync(this.delayUntilNextAutoSync()));
    }, Math.max(0, delayMs));
  }

  private delayUntilNextAutoSync(): number {
    const baseDelay = this.settingsRepository.getAll().syncIntervalSeconds * 1000;
    return Math.max(baseDelay, this.nextAutoSyncAt - Date.now());
  }

  private registerTemporaryFailure(baseDelayMs: number): void {
    this.consecutiveTemporaryFailures += 1;
    const exponent = Math.min(this.consecutiveTemporaryFailures - 1, 10);
    const delay = Math.min(this.maxBackoffMs, baseDelayMs * 2 ** exponent);
    this.nextAutoSyncAt = Date.now() + delay;
  }

  private resetBackoff(): void {
    this.consecutiveTemporaryFailures = 0;
    this.nextAutoSyncAt = 0;
  }

  private notifyChanged(): void {
    this.listeners.forEach((listener) => listener());
  }
}
