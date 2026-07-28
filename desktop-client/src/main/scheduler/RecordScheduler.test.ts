import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/constants";
import type { ActivityRecord, ClientSettings, ModelSummary } from "../../shared/types";
import { RecordScheduler } from "./RecordScheduler";

const summary: ModelSummary = {
  requestId: "request-1",
  summary: "正在编辑项目代码",
  category: "编程开发",
  confidence: 0.9,
  sensitive: false
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function createScheduler(options: {
  summarize?: ReturnType<typeof vi.fn>;
  encodeForModel?: ReturnType<typeof vi.fn>;
} = {}) {
  const settings = { ...DEFAULT_SETTINGS, captureIntervalSeconds: 1 } as ClientSettings;
  const inserted: ActivityRecord[] = [];
  const encodeForModel = options.encodeForModel ?? vi.fn(() => ({ imageBase64: "jpeg-data", imageMimeType: "image/jpeg" as const }));
  const summarize = options.summarize ?? vi.fn(async () => summary);
  const records = {
    insert: vi.fn((record: ActivityRecord) => inserted.push(record)),
    getLast: vi.fn(() => inserted.at(-1)),
    todaySeconds: vi.fn(() => inserted.reduce((total, record) => total + record.durationSeconds, 0)),
    dashboardSnapshot: vi.fn(() => ({
      lastRecord: inserted.at(-1),
      todaySeconds: inserted.reduce((total, record) => total + record.durationSeconds, 0),
      uploadCounts: { pending: inserted.length, uploading: 0, synced: 0, failed: 0, ignored: 0 }
    }))
  };
  const scheduler = new RecordScheduler(
    { getAll: () => settings, get: (_key: string, fallback: unknown) => fallback } as never,
    records as never,
    { create: vi.fn(() => "session-1"), close: vi.fn() } as never,
    { getActiveWindow: vi.fn(async () => ({ appName: "Visual Studio Code", processName: "Code.exe", windowTitle: "Activity Daily", capturedAt: new Date().toISOString() })) } as never,
    { capture: vi.fn(async () => ({ frameId: crypto.randomUUID(), capturedAt: new Date().toISOString(), width: 1280, height: 720, imageHash: "0".repeat(64), source: "active_monitor", encodeForModel })) } as never,
    { shouldSkipCapture: () => ({ action: "allow" }), sanitizeWindowTitle: (value?: string) => value, sanitizeSummary: (value: string) => value } as never,
    () => ({ healthCheck: vi.fn(async () => ({ status: "ok" as const, provider: "transformers" as const, modelName: "test", supportsImage: true })), summarize }),
    { getState: () => ({ isIdle: false, idleSeconds: 0 }) } as never,
    { status: () => ({ pending: 0, failed: 0, synced: 0 }), requestSyncSoon: vi.fn(), subscribe: vi.fn(() => () => undefined) } as never
  );
  return { scheduler, records, summarize, encodeForModel };
}

describe("RecordScheduler performance controls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for inference completion before scheduling the next capture", async () => {
    const firstInference = deferred<ModelSummary>();
    let calls = 0;
    const summarize = vi.fn(() => {
      calls += 1;
      return calls === 1 ? firstInference.promise : Promise.resolve(summary);
    });
    const { scheduler, records } = createScheduler({ summarize });

    const start = scheduler.start();
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(records.insert).not.toHaveBeenCalled();

    firstInference.resolve(summary);
    await start;
    await vi.advanceTimersByTimeAsync(999);
    expect(summarize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(records.insert).toHaveBeenCalledTimes(2));
  });

  it("does not persist an in-flight result after stop", async () => {
    const inference = deferred<ModelSummary>();
    const summarize = vi.fn(() => inference.promise);
    const { scheduler, records } = createScheduler({ summarize });

    const start = scheduler.start();
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    await scheduler.stop();
    inference.resolve(summary);
    await start;

    expect(records.insert).not.toHaveBeenCalled();
    expect((await scheduler.status()).state).toBe("Stopped");
  });

  it("skips image encoding and inference when the active screen is unchanged", async () => {
    const { scheduler, records, summarize, encodeForModel } = createScheduler();

    await scheduler.start();
    expect(encodeForModel).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(records.insert).toHaveBeenCalledTimes(2));
    expect(encodeForModel).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(records.insert.mock.calls[1]?.[0].metadata).toMatchObject({ local_model_skipped: true, skip_reason: "unchanged_screen" });
  });
});
