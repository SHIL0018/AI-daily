import type { ActivityRecord, ActivityCategory, ClientSettings, ModelHealth, ModelSummary, RecorderState, RecorderStatus } from "../../shared/types";
import { CaptureService } from "../capture/CaptureService";
import { ActiveWindowService } from "../active-window/ActiveWindowService";
import { PrivacyService } from "../privacy/PrivacyService";
import type { ModelAdapter } from "../model-adapter/ModelAdapter";
import { ActivityRecordRepository } from "../storage/ActivityRecordRepository";
import { SettingsRepository } from "../storage/SettingsRepository";
import { SessionRepository } from "../storage/SessionRepository";
import { IdleDetector } from "./IdleDetector";
import type { SyncService } from "../sync/SyncService";
import { errorMessage, logger } from "../logs/logger";
import { toShanghaiIso } from "../../shared/time";

type VisualSummaryCache = {
  imageHash: string;
  appName?: string;
  windowTitle?: string;
  processName?: string;
  summary: string;
  category: ActivityCategory;
  confidence?: number;
  privacyLevel: ActivityRecord["privacyLevel"];
};
export class RecordScheduler {
  private state: RecorderState = "Idle";
  private timer?: NodeJS.Timeout;
  private sessionId?: string;
  private lastCaptureAt?: Date;
  private lastError?: string;
  private modelHealth: ModelHealth = { status: "unavailable", provider: "transformers", modelName: "", supportsImage: true };
  private modelHealthCheckedAt = 0;
  private readonly modelHealthTtlMs = 5 * 60 * 1000;
  private lastVisualSummary?: VisualSummaryCache;
  private readonly visualHashMaxDistance = 8;
  private inferenceTotalMs = 0;
  private inferenceCount = 0;
  private lastInferenceMs?: number;
  private inferenceInProgress = false;
  private runVersion = 0;
  private captureTask?: Promise<void>;
  private captureAbortController?: AbortController;
  private inferenceRunVersion?: number;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly records: ActivityRecordRepository,
    private readonly sessions: SessionRepository,
    private readonly activeWindow: ActiveWindowService,
    private readonly capture: CaptureService,
    private readonly privacy: PrivacyService,
    private readonly modelAdapterFactory: (settings: ClientSettings) => ModelAdapter,
    private readonly idleDetector: IdleDetector,
    private readonly syncService: SyncService
  ) {}

  async start(): Promise<RecorderStatus> {
    if (this.state === "Recording") return this.status();
    if (this.state === "Paused" && this.sessionId) return this.resume();
    logger.info("Recorder start requested");
    const version = this.beginRun("Recording");
    await this.waitForPreviousCapture();
    if (!this.isCurrentRun(version)) return this.status();
    const settings = this.settingsRepository.getAll();
    const deviceId = this.settingsRepository.get<string>("deviceId", "local-device-unregistered");
    if (this.sessionId) this.sessions.close(this.sessionId);
    this.sessionId = this.sessions.create(deviceId);
    this.lastCaptureAt = undefined;
    this.lastError = undefined;
    this.inferenceTotalMs = 0;
    this.inferenceCount = 0;
    this.lastInferenceMs = undefined;
    this.inferenceInProgress = false;
    this.notifyChanged();
    logger.info("Recorder session created", { sessionId: this.sessionId, deviceId, captureIntervalSeconds: settings.captureIntervalSeconds, modelProvider: settings.modelProvider, modelBaseUrl: settings.modelBaseUrl, modelName: settings.modelName });
    await this.runCaptureCycle(version);
    return this.status();
  }

  async pause(): Promise<RecorderStatus> {
    logger.info("Recorder pause requested", { state: this.state, sessionId: this.sessionId });
    if (this.state === "Recording") this.beginRun("Paused");
    this.notifyChanged();
    return this.status();
  }

  async resume(): Promise<RecorderStatus> {
    if (this.state !== "Paused" || !this.sessionId) return this.start();
    logger.info("Recorder resume requested", { sessionId: this.sessionId });
    const version = this.beginRun("Recording");
    this.lastCaptureAt = undefined;
    this.lastError = undefined;
    this.notifyChanged();
    await this.waitForPreviousCapture();
    if (this.isCurrentRun(version)) await this.runCaptureCycle(version);
    return this.status();
  }

  refreshSchedule(): void {
    if (this.state !== "Recording") return;
    const settings = this.settingsRepository.getAll();
    this.clearTimer();
    this.scheduleNext(this.runVersion, settings.captureIntervalSeconds);
    logger.info("Recorder schedule refreshed", { captureIntervalSeconds: settings.captureIntervalSeconds });
  }

  canUpdateSettings(): boolean {
    return this.state !== "Recording";
  }
  async stop(): Promise<RecorderStatus> {
    this.beginRun("Stopped");
    if (this.sessionId) this.sessions.close(this.sessionId);
    this.sessionId = undefined;
    this.lastCaptureAt = undefined;
    this.notifyChanged();
    return this.status();
  }

  async status(): Promise<RecorderStatus> {
    const snapshot = this.records.dashboardSnapshot();
    return {
      state: this.state,
      sessionId: this.sessionId,
      model: this.modelHealth,
      inference: {
        averageMs: this.inferenceCount > 0 ? Math.round(this.inferenceTotalMs / this.inferenceCount) : 0,
        count: this.inferenceCount,
        lastMs: this.lastInferenceMs,
        inProgress: this.inferenceInProgress
      },
      sync: this.syncService.status(snapshot.uploadCounts),
      todaySeconds: snapshot.todaySeconds,
      lastRecord: snapshot.lastRecord,
      errorMessage: this.lastError
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async healthCheck(): Promise<ModelHealth> {
    const settings = this.settingsRepository.getAll();
    logger.info("Model health check requested", { provider: settings.modelProvider, baseUrl: settings.modelBaseUrl, modelName: settings.modelName });
    this.modelHealth = await this.modelAdapterFactory(settings).healthCheck();
    this.modelHealthCheckedAt = Date.now();
    logger.info("Model health check result", this.modelHealth);
    this.notifyChanged();
    return this.modelHealth;
  }

  private async cachedHealthCheck(settings: ClientSettings): Promise<ModelHealth> {
    const now = Date.now();
    if (this.modelHealthCheckedAt && now - this.modelHealthCheckedAt < this.modelHealthTtlMs) return this.modelHealth;
    this.modelHealth = await this.modelAdapterFactory(settings).healthCheck();
    this.modelHealthCheckedAt = now;
    return this.modelHealth;
  }

  private async runCaptureCycle(version: number): Promise<void> {
    if (!this.isCurrentRun(version)) return;
    const task = this.captureOnce(version);
    this.captureTask = task;
    try {
      await task;
    } finally {
      if (this.captureTask === task) this.captureTask = undefined;
      if (this.isCurrentRun(version)) this.scheduleNext(version);
    }
  }

  private async captureOnce(version: number): Promise<void> {
    if (!this.isCurrentRun(version) || !this.sessionId) return;
    const abortController = new AbortController();
    this.captureAbortController = abortController;
    const settings = this.settingsRepository.getAll();
    const idle = this.idleDetector.getState(settings.idleThresholdSeconds);
    const now = new Date();
    const start = this.lastCaptureAt ?? now;
    this.lastCaptureAt = now;
    try {
      logger.debug("Capture tick started", { sessionId: this.sessionId, start: start.toISOString(), end: now.toISOString(), idle: idle.isIdle });
      const active = await this.activeWindow.getActiveWindow();
      if (!this.isCurrentRun(version)) return;
      logger.debug("Active window captured", { appName: active.appName, processName: active.processName, hasWindowTitle: Boolean(active.windowTitle), displayId: active.displayId });
      const privacyDecision = this.privacy.shouldSkipCapture(active, settings);
      logger.debug("Privacy decision", { action: privacyDecision.action, reason: privacyDecision.reason });
      let record: ActivityRecord;
      if (idle.isIdle) {
        record = this.buildRecord(start, now, active, "空闲", "用户处于空闲状态", 1, "normal");
      } else if (privacyDecision.action !== "allow") {
        this.lastVisualSummary = undefined;
        record = this.buildRecord(start, now, active, "隐私", "隐私内容，已跳过分析", 1, "private");
        record.appName = undefined;
        record.windowTitle = undefined;
      } else {
        logger.debug("Screen capture requested", { mode: settings.multiMonitorMode });
        const frame = await this.capture.capture(settings, active);
        if (!this.isCurrentRun(version)) return;
        logger.debug("Screen capture completed", { width: frame.width, height: frame.height, source: frame.source, hasHash: Boolean(frame.imageHash) });
        const previous = this.records.getLast();
        const reused = this.reuseVisualSummaryIfUnchanged(frame.imageHash, active);
        if (reused) {
          logger.debug("Screen unchanged; reusing previous visual summary", { imageHash: frame.imageHash, distance: reused.distance, category: reused.category });
          record = this.buildRecord(
            start,
            now,
            active,
            reused.category,
            this.privacy.sanitizeSummary(reused.summary),
            reused.confidence ?? 0.8,
            reused.privacyLevel,
            { local_model_skipped: true, skip_reason: "unchanged_screen", screen_hash: frame.imageHash, screen_hash_distance: reused.distance }
          );
          this.rememberVisualSummary(frame.imageHash, active, record);
        } else {
          const adapter = this.modelAdapterFactory(settings);
          this.modelHealth = await this.cachedHealthCheck(settings);
          if (!this.isCurrentRun(version)) return;
          logger.debug("Model health before summarize", this.modelHealth);
          logger.debug("Model summarize requested", { provider: settings.modelProvider, modelName: settings.modelName });
          const encodedImage = frame.encodeForModel();
          const inferenceStartedAt = Date.now();
          let inferenceDurationMs: number | undefined;
          let summary: ModelSummary;
          this.inferenceInProgress = true;
          this.inferenceRunVersion = version;
          this.notifyChanged();
          try {
            summary = await adapter.summarize({
              requestId: crypto.randomUUID(),
              timestamp: now.toISOString(),
              appName: active.appName,
              windowTitle: this.privacy.sanitizeWindowTitle(active.windowTitle),
              imageBase64: encodedImage.imageBase64,
              imageMimeType: encodedImage.imageMimeType,
              signal: abortController.signal
            });
            if (!this.isCurrentRun(version)) return;
            inferenceDurationMs = Math.max(0, Date.now() - inferenceStartedAt);
            this.lastInferenceMs = inferenceDurationMs;
            this.inferenceTotalMs += inferenceDurationMs;
            this.inferenceCount += 1;
            logger.info("Model inference timing updated", {
              durationMs: inferenceDurationMs,
              count: this.inferenceCount,
              averageMs: Math.round(this.inferenceTotalMs / this.inferenceCount)
            });
          } finally {
            if (this.inferenceRunVersion === version) {
              this.inferenceInProgress = false;
              this.inferenceRunVersion = undefined;
              this.notifyChanged();
            }
          }
          const usableSummary = this.preventRepeatedSummary(summary, previous, active);
          logger.debug("Model summarize completed", { category: usableSummary.category, confidence: usableSummary.confidence, sensitive: usableSummary.sensitive, adjusted: usableSummary !== summary });
          record = this.buildRecord(
            start,
            now,
            active,
            usableSummary.category,
            this.privacy.sanitizeSummary(usableSummary.summary),
            usableSummary.confidence,
            usableSummary.sensitive ? "private" : "normal",
            { local_model_skipped: false, local_model_inference_ms: inferenceDurationMs, screen_hash: frame.imageHash }
          );
          this.rememberVisualSummary(frame.imageHash, active, record);
        }
      }
      if (!this.isCurrentRun(version)) return;
      this.records.insert(record);
      logger.info("Activity record inserted", { id: record.id, category: record.category, durationSeconds: record.durationSeconds, uploadStatus: record.uploadStatus });
      this.syncService.requestSyncSoon();
      this.notifyChanged();
    } catch (error) {
      if (!this.isCurrentRun(version) || abortController.signal.aborted) return;
      this.lastError = errorMessage(error);
      logger.error("Recorder capture failed", { sessionId: this.sessionId, error: this.lastError });
      this.state = "Error";
      this.invalidateRun();
      this.notifyChanged();
    } finally {
      if (this.captureAbortController === abortController) this.captureAbortController = undefined;
    }
  }

  private beginRun(state: RecorderState): number {
    this.invalidateRun();
    this.state = state;
    return this.runVersion;
  }

  private invalidateRun(): void {
    this.runVersion += 1;
    this.clearTimer();
    this.captureAbortController?.abort();
    this.captureAbortController = undefined;
    this.inferenceInProgress = false;
    this.inferenceRunVersion = undefined;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private isCurrentRun(version: number): boolean {
    return version === this.runVersion && this.state === "Recording";
  }

  private scheduleNext(version: number, intervalSeconds?: number): void {
    if (!this.isCurrentRun(version)) return;
    this.clearTimer();
    const delaySeconds = intervalSeconds ?? this.settingsRepository.getAll().captureIntervalSeconds;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runCaptureCycle(version);
    }, delaySeconds * 1000);
  }

  private async waitForPreviousCapture(): Promise<void> {
    const previous = this.captureTask;
    if (previous) await previous.catch(() => undefined);
  }

  private notifyChanged(): void {
    this.listeners.forEach((listener) => listener());
  }

  private preventRepeatedSummary(summary: ModelSummary, previous: ActivityRecord | undefined, active: { appName?: string; windowTitle?: string; processName?: string }): ModelSummary {
    if (!previous) return summary;
    const sameSummary = this.normalizeText(summary.summary) === this.normalizeText(previous.summary);
    if (!sameSummary) return summary;

    const activeChanged = this.normalizeText(active.appName) !== this.normalizeText(previous.appName)
      || this.normalizeText(active.windowTitle) !== this.normalizeText(previous.windowTitle)
      || this.normalizeText(active.processName) !== this.normalizeText(previous.processName);
    if (!activeChanged) return summary;

    const fallback = this.fallbackSummaryForActive(active);
    logger.warn("Model repeated previous summary after active window changed; using current-window fallback", {
      previousRecordId: previous.id,
      previousAppName: previous.appName,
      currentAppName: active.appName,
      hasCurrentTitle: Boolean(active.windowTitle)
    });
    return {
      ...summary,
      summary: fallback.summary,
      category: fallback.category,
      confidence: Math.min(summary.confidence, fallback.confidence),
      reason: "模型重复上一条摘要，已改用当前应用/窗口信息生成摘要"
    };
  }


  private reuseVisualSummaryIfUnchanged(imageHash: string | undefined, active: { appName?: string; windowTitle?: string; processName?: string }): (VisualSummaryCache & { distance: number }) | undefined {
    if (!imageHash || !this.lastVisualSummary) return undefined;
    if (!this.sameActiveSignature(active, this.lastVisualSummary)) return undefined;
    const distance = this.hammingDistance(imageHash, this.lastVisualSummary.imageHash);
    if (distance > this.visualHashMaxDistance) return undefined;
    return { ...this.lastVisualSummary, distance };
  }

  private rememberVisualSummary(imageHash: string | undefined, active: { appName?: string; windowTitle?: string; processName?: string }, record: ActivityRecord): void {
    if (!imageHash) return;
    this.lastVisualSummary = {
      imageHash,
      appName: active.appName,
      windowTitle: active.windowTitle,
      processName: active.processName,
      summary: record.summary,
      category: record.category,
      confidence: record.confidence,
      privacyLevel: record.privacyLevel
    };
  }

  private sameActiveSignature(left: { appName?: string; windowTitle?: string; processName?: string }, right: { appName?: string; windowTitle?: string; processName?: string }): boolean {
    return this.normalizeText(left.appName) === this.normalizeText(right.appName)
      && this.normalizeText(left.windowTitle) === this.normalizeText(right.windowTitle)
      && this.normalizeText(left.processName) === this.normalizeText(right.processName);
  }

  private hammingDistance(left: string, right: string): number {
    if (left.length !== right.length) return Number.MAX_SAFE_INTEGER;
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      const a = Number.parseInt(left[index] ?? "0", 16);
      const b = Number.parseInt(right[index] ?? "0", 16);
      if (Number.isNaN(a) || Number.isNaN(b)) return Number.MAX_SAFE_INTEGER;
      distance += this.bitCount(a ^ b);
    }
    return distance;
  }

  private bitCount(value: number): number {
    let count = 0;
    while (value) {
      value &= value - 1;
      count += 1;
    }
    return count;
  }
  private fallbackSummaryForActive(active: { appName?: string; windowTitle?: string; processName?: string }): { summary: string; category: ActivityCategory; confidence: number } {
    const cleanAppName = this.cleanInlineText(active.appName);
    const cleanTitle = this.cleanInlineText(active.windowTitle);
    const lowered = (cleanAppName ?? active.processName ?? "").toLowerCase();
    const category: ActivityCategory = lowered.includes("code") || lowered.includes("cursor") || lowered.includes("visual studio")
      ? "编程开发"
      : lowered.includes("chrome") || lowered.includes("edge") || lowered.includes("firefox")
        ? "信息检索"
        : "其他";
    const summaryText = cleanAppName && cleanTitle
      ? `使用 ${cleanAppName}：${cleanTitle}`
      : cleanAppName
        ? `使用 ${cleanAppName}`
        : cleanTitle
          ? `查看 ${cleanTitle}`
          : "使用电脑，具体内容不明确";
    return { summary: summaryText, category, confidence: cleanAppName || cleanTitle ? 0.45 : 0.35 };
  }

  private cleanInlineText(value?: string): string | undefined {
    const cleaned = value?.replace(/\s+/g, " ").trim();
    return cleaned || undefined;
  }

  private normalizeText(value?: string): string {
    return this.cleanInlineText(value)?.toLowerCase() ?? "";
  }
  private buildRecord(start: Date, end: Date, active: { appName?: string; windowTitle?: string; processName?: string }, category: ActivityRecord["category"], summary: string, confidence: number, privacyLevel: ActivityRecord["privacyLevel"], extraMetadata: Record<string, unknown> = {}): ActivityRecord {
    const settings = this.settingsRepository.getAll();
    const durationSeconds = Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000));
    const now = toShanghaiIso();
    return {
      id: crypto.randomUUID(),
      deviceId: this.settingsRepository.get<string>("deviceId", "local-device-unregistered"),
      sessionId: this.sessionId!,
      startTime: toShanghaiIso(start),
      endTime: toShanghaiIso(end),
      durationSeconds,
      appName: active.appName,
      windowTitle: settings.uploadWindowTitle ? this.privacy.sanitizeWindowTitle(active.windowTitle) : undefined,
      processName: active.processName,
      summary,
      category,
      confidence,
      privacyLevel,
      uploadStatus: "pending",
      retryCount: 0,
      metadata: { local_model_provider: settings.modelProvider, local_model_name: settings.modelName, ...extraMetadata },
      createdAt: now,
      updatedAt: now
    };
  }
}







