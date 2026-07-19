export type ActivityCategory =
  | "编程开发"
  | "文档写作"
  | "论文阅读"
  | "数据分析"
  | "模型训练"
  | "会议沟通"
  | "信息检索"
  | "娱乐休息"
  | "系统操作"
  | "空闲"
  | "隐私"
  | "其他";

export type RecorderState = "Idle" | "Recording" | "Paused" | "Stopped" | "Error";
export type PrivacyLevel = "normal" | "private" | "redacted";
export type UploadStatus = "pending" | "uploading" | "synced" | "failed" | "ignored";
export type PermissionStatus = "granted" | "denied" | "unknown";

export interface ClientSettings {
  captureIntervalSeconds: number;
  minCaptureIntervalSeconds: number;
  maxCaptureIntervalSeconds: number;
  idleThresholdSeconds: number;
  captureMode: string;
  multiMonitorMode: "active_monitor" | "primary_monitor" | "all_monitors";
  maxImageLongEdge: number;
  saveScreenshot: boolean;
  uploadRawScreenshot: boolean;
  uploadWindowTitle: boolean;
  privacyAppBlacklist: string[];
  privacyTitleKeywords: string[];
  modelProvider: "ollama" | "local_http" | "transformers";
  modelBaseUrl: string;
  modelName: string;
  modelTimeoutSeconds: number;
  serverUrl: string;
  syncIntervalSeconds: number;
  syncBatchSize: number;
  maxRetryCount: number;
}

export interface ActiveWindowInfo {
  appName?: string;
  processName?: string;
  windowTitle?: string;
  windowId?: string;
  displayId?: string;
  capturedAt: string;
}

export interface CaptureFrame {
  frameId: string;
  capturedAt: string;
  displayId?: string;
  width: number;
  height: number;
  imageBase64?: string;
  imageHash?: string;
  imageBuffer?: Buffer;
  source: "primary_monitor" | "active_monitor" | "all_monitors";
}

export interface RecentActivity {
  startTime: string;
  endTime: string;
  summary: string;
}

export interface ScreenSummaryInput {
  requestId: string;
  timestamp: string;
  appName?: string;
  windowTitle?: string;
  imageBase64?: string;
  previousSummary?: string;
  recentContext?: RecentActivity[];
}

export interface ModelHealth {
  status: "ok" | "unavailable" | "error";
  provider: "ollama" | "local_http" | "transformers";
  modelName: string;
  supportsImage: boolean;
  message?: string;
}

export interface ModelSummary {
  requestId: string;
  summary: string;
  category: ActivityCategory;
  confidence: number;
  sensitive: boolean;
  reason?: string;
}

export interface ActivityRecord {
  id: string;
  userId?: string;
  deviceId: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  appName?: string;
  windowTitle?: string;
  processName?: string;
  summary: string;
  category: ActivityCategory;
  confidence?: number;
  privacyLevel: PrivacyLevel;
  uploadStatus: UploadStatus;
  retryCount: number;
  serverRecordId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecorderStatus {
  state: RecorderState;
  sessionId?: string;
  model: ModelHealth;
  inference: InferenceStats;
  sync: SyncStatus;
  todaySeconds: number;
  lastRecord?: ActivityRecord;
  errorMessage?: string;
}

export interface InferenceStats {
  averageMs: number;
  count: number;
  lastMs?: number;
  inProgress: boolean;
}

export interface SyncStatus {
  pending: number;
  failed: number;
  synced: number;
  lastSyncAt?: string;
  lastError?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SyncResult {
  accepted: number;
  duplicated: number;
  failed: number;
}
