import type { ActivityRecord, ClientSettings, LoginResult, SyncResult } from "../../shared/types";

export class ApiClient {
  constructor(
    private readonly settings: ClientSettings,
    private readonly getToken: () => string | undefined,
    private readonly getRefreshToken?: () => string | undefined,
    private readonly saveAccessToken?: (token: string) => void
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const response = await fetch(`${this.baseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    return { accessToken: json.data.access_token, refreshToken: json.data.refresh_token, expiresIn: json.data.expires_in };
  }

  async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken?.();
    if (!refreshToken) throw new Error("Login expired, please sign in again");
    const response = await fetch(`${this.baseUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) throw new Error(await response.text());
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
    const response = await this.request("/api/v1/activity-records/batch", { method: "POST", body: JSON.stringify(payload) });
    const json = await response.json();
    return json.data;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let token = this.getToken();
    if (!token && this.getRefreshToken?.()) token = await this.refreshAccessToken();
    if (!token) throw new Error("Not logged in");

    let response = await this.authorizedFetch(path, init, token);
    if (response.status === 401 && this.getRefreshToken?.()) {
      token = await this.refreshAccessToken();
      response = await this.authorizedFetch(path, init, token);
    }
    if (!response.ok) throw new Error(await response.text());
    return response;
  }

  private authorizedFetch(path: string, init: RequestInit, token: string): Promise<Response> {
    return fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
    });
  }

  private baseUrl(): string {
    return this.settings.serverUrl.replace(/\/$/, "");
  }
}
