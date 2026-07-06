import os from "node:os";
import type { ClientSettings, SyncResult, SyncStatus } from "../../shared/types";
import { ActivityRecordRepository } from "../storage/ActivityRecordRepository";
import { SettingsRepository } from "../storage/SettingsRepository";
import { PrivacyService } from "../privacy/PrivacyService";
import { ApiClient } from "./ApiClient";
import { SyncQueue } from "./SyncQueue";

type UploadResult = SyncResult & { results: Array<{ client_record_id: string; server_record_id?: string; status: string; error?: string }> };

const EMPTY_SYNC_RESULT: UploadResult = { accepted: 0, duplicated: 0, failed: 0, results: [] };

export class SyncService {
  private timer?: NodeJS.Timeout;
  private pendingTimer?: NodeJS.Timeout;
  private currentSync?: Promise<UploadResult>;
  private lastSyncAt?: string;
  private lastError?: string;

  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly records: ActivityRecordRepository,
    private readonly privacy: PrivacyService,
    private readonly queue: SyncQueue
  ) {}

  startAutoSync(): void {
    const settings = this.settingsRepository.getAll();
    this.stopAutoSync();
    this.timer = setInterval(() => {
      void this.syncOnce().catch(() => undefined);
    }, settings.syncIntervalSeconds * 1000);
  }

  stopAutoSync(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.timer = undefined;
    this.pendingTimer = undefined;
  }

  requestSyncSoon(delayMs = 5000): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      void this.syncOnce().catch(() => undefined);
    }, delayMs);
  }

  status(): SyncStatus {
    const counts = this.records.countByUploadStatus();
    return {
      pending: counts.pending,
      failed: counts.failed,
      synced: counts.synced,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError
    };
  }

  async login(email: string, password: string) {
    const api = this.createApiClient();
    const result = await api.login(email, password);
    this.settingsRepository.set("accessToken", result.accessToken);
    this.settingsRepository.set("refreshToken", result.refreshToken);
    return result;
  }

  async registerDevice(): Promise<string> {
    const api = this.createApiClient();
    const deviceId = await api.registerDevice(os.hostname(), os.platform(), os.release());
    this.settingsRepository.set("deviceId", deviceId);
    return deviceId;
  }

  async syncOnce(): Promise<UploadResult> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    if (this.currentSync) return this.currentSync;
    const task = this.runSyncOnce();
    this.currentSync = task;
    try {
      return await task;
    } finally {
      if (this.currentSync === task) this.currentSync = undefined;
    }
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
    try {
      const api = this.createApiClient(settings);
      const result = await api.uploadRecords(deviceId, batch);
      for (const item of result.results) {
        if (item.status === "accepted" || item.status === "duplicated") this.records.markSynced(item.client_record_id, item.server_record_id);
        else this.records.markFailed(item.client_record_id, item.error ?? "sync failed");
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = undefined;
      this.queue.finish(syncId, result.accepted + result.duplicated, result.failed);
      return result;
    } catch (error) {
      const message = String(error);
      this.lastError = message;
      batch.forEach((record) => this.records.markFailed(record.id, message));
      this.queue.fail(syncId, message);
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
}