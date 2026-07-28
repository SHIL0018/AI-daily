import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/constants";
import type { ActivityRecord, ClientSettings } from "../../shared/types";
import { SyncService } from "./SyncService";

const record: ActivityRecord = {
  id: "record-1",
  deviceId: "device-1",
  sessionId: "session-1",
  startTime: "2026-07-27T10:00:00+08:00",
  endTime: "2026-07-27T10:00:30+08:00",
  durationSeconds: 30,
  summary: "正在编辑项目代码",
  category: "编程开发",
  privacyLevel: "normal",
  uploadStatus: "pending",
  retryCount: 0,
  createdAt: "2026-07-27T10:00:30+08:00",
  updatedAt: "2026-07-27T10:00:30+08:00"
};

function createService() {
  const settings = { ...DEFAULT_SETTINGS, syncIntervalSeconds: 10 } as ClientSettings;
  const records = {
    listForSync: vi.fn(() => [record]),
    markUploading: vi.fn(),
    markSynced: vi.fn(),
    markFailed: vi.fn(),
    restorePending: vi.fn(),
    retryFailed: vi.fn(() => 1),
    countByUploadStatus: vi.fn(() => ({ pending: 1, uploading: 0, synced: 0, failed: 0, ignored: 0 }))
  };
  const repository = {
    getAll: () => settings,
    get: (key: string) => ({ deviceId: "device-1", accessToken: "token", refreshToken: "refresh" } as Record<string, string>)[key],
    set: vi.fn()
  };
  const queue = { start: vi.fn(() => "sync-1"), finish: vi.fn(), fail: vi.fn() };
  const service = new SyncService(repository as never, records as never, { sanitizeBeforeUpload: (value: ActivityRecord) => value } as never, queue as never);
  return { service, records, queue };
}

function successResponse() {
  return new Response(JSON.stringify({
    data: {
      accepted_count: 1,
      duplicate_count: 0,
      rejected: [],
      results: [{ client_record_id: "record-1", server_record_id: "server-1", status: "accepted" }]
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("SyncService retry semantics", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("restores records without incrementing retries after a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { service, records } = createService();

    await expect(service.syncOnce()).rejects.toThrow("稍后自动重试");

    expect(records.restorePending).toHaveBeenCalledWith([record], expect.any(String));
    expect(records.markFailed).not.toHaveBeenCalled();
  });

  it("marks records failed when the server permanently rejects the batch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: "INVALID_PARAMS", message: "invalid record" } }), { status: 400 })));
    const { service, records } = createService();

    await expect(service.syncOnce()).rejects.toThrow("invalid record");

    expect(records.markFailed).toHaveBeenCalledWith("record-1", "invalid record");
    expect(records.restorePending).not.toHaveBeenCalled();
  });

  it("backs off consecutive temporary failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { service } = createService();

    await expect(service.syncOnce()).rejects.toThrow();
    service.requestSyncSoon(0);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    service.requestSyncSoon(0);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("restores failed records and immediately retries them on user request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const { service, records } = createService();

    const result = await service.retryFailedRecords();

    expect(result.restored).toBe(1);
    expect(records.retryFailed).toHaveBeenCalledOnce();
    expect(records.markSynced).toHaveBeenCalledWith("record-1", "server-1");
  });
});
