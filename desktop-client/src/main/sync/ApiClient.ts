import type { ActivityRecord, ClientSettings, LoginResult, SyncResult } from "../../shared/types";

export type ApiErrorCategory = "temporary" | "auth" | "configuration" | "permanent";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly category: ApiErrorCategory,
    readonly status?: number,
    readonly code?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApiRequestError";
  }

  get retryable(): boolean {
    return this.category === "temporary";
  }
}

export class ApiClient {
  constructor(
    private readonly settings: ClientSettings,
    private readonly getToken: () => string | undefined,
    private readonly getRefreshToken?: () => string | undefined,
    private readonly saveAccessToken?: (token: string) => void
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const response = await this.fetch(`${this.baseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw await this.responseError(response);
    const json = await response.json();
    return { accessToken: json.data.access_token, refreshToken: json.data.refresh_token, expiresIn: json.data.expires_in };
  }

  async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken?.();
    if (!refreshToken) throw new ApiRequestError("登录已过期，请重新登录", "auth");
    const response = await this.fetch(`${this.baseUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) {
      const error = await this.responseError(response);
      throw new ApiRequestError(error.message, "auth", response.status, error.code, { cause: error });
    }
    const json = await response.json();
    const accessToken = json.data.access_token;
    this.saveAccessToken?.(accessToken);
    return accessToken;
  }

  async registerDevice(deviceName: string, osType: string, osVersion?: string): Promise<string> {
    const response = await this.request("/api/v1/devices", {
      method: "POST",
      body: JSON.stringify({ device_name: deviceName, os_type: osType, os_version: osVersion, client_version: "electron-mvp" })
    });
    const json = await response.json();
    return json.data.device_id;
  }

  async uploadRecords(deviceId: string, records: ActivityRecord[]): Promise<SyncResult & { results: Array<{ client_record_id: string; server_record_id?: string; status: string; error?: string }> }> {
    const payload = {
      device_id: deviceId,
      records: records.map((record) => ({
        client_record_id: record.id,
        session_id: record.sessionId,
        start_time: record.startTime,
        end_time: record.endTime,
        duration_seconds: record.durationSeconds,
        app_name: record.appName,
        window_title: record.windowTitle,
        process_name: record.processName,
        summary: record.summary,
        category: record.category,
        confidence: record.confidence,
        privacy_level: record.privacyLevel,
        metadata: record.metadata
      }))
    };
    const response = await this.request("/api/v2/activities/batch", { method: "POST", body: JSON.stringify(payload) });
    const json = await response.json();
    const data = json.data;
    return {
      accepted: Number(data.accepted_count ?? 0),
      duplicated: Number(data.duplicate_count ?? 0),
      failed: Array.isArray(data.rejected) ? data.rejected.length : 0,
      results: Array.isArray(data.results) ? data.results : []
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let token = this.getToken();
    if (!token && this.getRefreshToken?.()) token = await this.refreshAccessToken();
    if (!token) throw new ApiRequestError("请先登录", "auth");

    let response = await this.authorizedFetch(path, init, token);
    if ((response.status === 401 || response.status === 403) && this.getRefreshToken?.()) {
      token = await this.refreshAccessToken();
      response = await this.authorizedFetch(path, init, token);
    }
    if (!response.ok) throw await this.responseError(response);
    return response;
  }

  private authorizedFetch(path: string, init: RequestInit, token: string): Promise<Response> {
    return this.fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
    });
  }

  private async responseError(response: Response): Promise<ApiRequestError> {
    const text = await response.text();
    let code: string | undefined;
    let message = text || `HTTP ${response.status} ${response.statusText || "请求失败"}`;
    try {
      const body = JSON.parse(text);
      code = body?.detail?.code || body?.code;
      message = body?.detail?.message || body?.message || message;
    } catch {}
    return new ApiRequestError(message, this.categoryForStatus(response.status), response.status, code);
  }

  private categoryForStatus(status: number): ApiErrorCategory {
    if (status === 408 || status === 429 || status >= 500) return "temporary";
    if (status === 401 || status === 403) return "auth";
    if (status === 404) return "configuration";
    return "permanent";
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new ApiRequestError("无法连接服务器，将稍后自动重试", "temporary", undefined, undefined, { cause: error });
    }
  }

  private baseUrl(): string {
    return this.settings.serverUrl.replace(/\/$/, "");
  }
}
