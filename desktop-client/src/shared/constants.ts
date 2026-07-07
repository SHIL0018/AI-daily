export const ACTIVITY_CATEGORIES = [
  "编程开发",
  "文档写作",
  "论文阅读",
  "数据分析",
  "模型训练",
  "会议沟通",
  "信息检索",
  "娱乐休息",
  "系统操作",
  "空闲",
  "隐私",
  "其他"
] as const;

export const PRIVACY_LEVELS = ["normal", "private", "redacted"] as const;
export const UPLOAD_STATUSES = ["pending", "uploading", "synced", "failed", "ignored"] as const;

export const DEFAULT_SETTINGS = {
  captureIntervalSeconds: 30,
  minCaptureIntervalSeconds: 10,
  maxCaptureIntervalSeconds: 300,
  idleThresholdSeconds: 300,
  captureMode: "interval_and_event",
  multiMonitorMode: "active_monitor",
  maxImageLongEdge: 1280,
  saveScreenshot: false,
  uploadRawScreenshot: false,
  uploadWindowTitle: false,
  privacyAppBlacklist: ["1Password", "Bitwarden", "KeePass", "银行", "支付宝"],
  privacyTitleKeywords: ["密码", "验证码", "身份证", "银行卡", "token", "secret", "private key", "api key"],
  modelProvider: "transformers",
  modelBaseUrl: "http://127.0.0.1:8001/v1",
  modelName: "local-models/ollama/Qwen3.5-0.8B",
  modelTimeoutSeconds: 30,
  serverUrl: "http://111.229.36.195",
  syncIntervalSeconds: 60,
  syncBatchSize: 100,
  maxRetryCount: 5
};
