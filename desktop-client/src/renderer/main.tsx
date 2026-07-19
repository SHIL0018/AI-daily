import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ActivityRecord, ClientSettings, RecorderState, RecorderStatus } from "../shared/types";
import { formatShanghaiTime } from "../shared/time";
import "./styles.css";

declare global {
  interface Window {
    desktop: {
      recorder: { start(): Promise<RecorderStatus>; pause(): Promise<RecorderStatus>; resume(): Promise<RecorderStatus>; stop(): Promise<RecorderStatus>; status(): Promise<RecorderStatus> };
      model: { health(): Promise<unknown> };
      sync: { run(): Promise<unknown> };
      settings: { get(): Promise<ClientSettings & Record<string, unknown>>; update(patch: Partial<ClientSettings> & Record<string, unknown>): Promise<ClientSettings & Record<string, unknown>> };
      records: { list(limit?: number): Promise<ActivityRecord[]>; clear(): Promise<void> };
      auth: { login(email: string, password: string): Promise<unknown>; registerDevice(): Promise<string> };
      webReport: { open(): Promise<void> };
      logs: { openFolder(): Promise<void>; getPath(): Promise<string> };
    };
  }
}

function formatSeconds(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

const RECORDER_STATE_LABELS: Record<RecorderState, string> = {
  Idle: "未开始",
  Recording: "记录中",
  Paused: "已暂停",
  Stopped: "已停止",
  Error: "异常"
};

function formatInferenceTime(valueMs: number) {
  if (valueMs < 1000) return `${valueMs} ms`;
  return `${(valueMs / 1000).toFixed(valueMs >= 10000 ? 1 : 2)} 秒`;
}

function LoginPanel({ connected, onDone }: { connected: boolean; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setMessage("正在登录...");
    setLoading(true);
    try {
      await window.desktop.auth.login(email, password);
      setMessage("登录成功，正在注册设备...");
      await window.desktop.auth.registerDevice();
      setMessage("已连接服务端");
      setShowLogin(false);
      await onDone();
    } catch (err) {
      setMessage("");
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (connected && !showLogin) {
    return (
      <section className="panel login">
        <h2>连接服务端</h2>
        <p className="message">已连接服务端，活动记录会按同步队列上传。</p>
        <button type="button" onClick={() => setShowLogin(true)}>重新登录</button>
      </section>
    );
  }

  return (
    <section className="panel login">
      <h2>连接服务端</h2>
      <form onSubmit={submit}>
        <label>邮箱<input disabled={loading} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密码<input disabled={loading} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button disabled={loading} type="submit">{loading ? "正在连接" : "登录并注册设备"}</button>
      </form>
      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function StatusCards({ status }: { status?: RecorderStatus }) {
  const state = status?.state ?? "Idle";
  const inference = status?.inference;
  return (
    <section className="cards">
      <div className={`status-card state-${state.toLowerCase()}`}><span>记录状态</span><strong>{RECORDER_STATE_LABELS[state]}</strong></div>
      <div className={`status-card model-${status?.model.status ?? "unknown"}`}><span>模型状态</span><strong>{status?.model.status ?? "unknown"}</strong></div>
      <div className="status-card inference-card">
        <span>平均推理</span>
        <strong>{inference?.count ? formatInferenceTime(inference.averageMs) : inference?.inProgress ? "推理中..." : "等待首次推理"}</strong>
        <small>{inference?.count ? `已完成 ${inference.count} 次` : "仅统计实际模型调用"}</small>
      </div>
      <div className="status-card"><span>今日时长</span><strong>{formatSeconds(status?.todaySeconds ?? 0)}</strong></div>
      <div className="status-card"><span>待同步</span><strong>{status?.sync.pending ?? 0}</strong></div>
    </section>
  );
}

function SettingsPanel({ settings, disabled, onSaved }: { settings?: ClientSettings & Record<string, unknown>; disabled: boolean; onSaved: (settings: ClientSettings & Record<string, unknown>) => void }) {
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl ?? "");
  const [modelProvider, setModelProvider] = useState<ClientSettings["modelProvider"]>(settings?.modelProvider ?? "transformers");
  const [modelBaseUrl, setModelBaseUrl] = useState(settings?.modelBaseUrl ?? "");
  const [modelName, setModelName] = useState(settings?.modelName ?? "");
  const [captureIntervalSeconds, setCaptureIntervalSeconds] = useState(settings?.captureIntervalSeconds ?? 30);

  useEffect(() => {
    if (settings) {
      setServerUrl(settings.serverUrl);
      setModelProvider(settings.modelProvider);
      setModelBaseUrl(settings.modelBaseUrl);
      setModelName(settings.modelName);
      setCaptureIntervalSeconds(settings.captureIntervalSeconds);
    }
  }, [settings]);

  async function save() {
    if (disabled) return;
    const updated = await window.desktop.settings.update({ serverUrl, modelProvider, modelBaseUrl, modelName, captureIntervalSeconds: Number(captureIntervalSeconds) });
    onSaved(updated);
  }

  return (
    <section className="panel settings">
      <h2>设置</h2>
      <label>服务端地址<input disabled={disabled} value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>
      <label>模型 Provider<select disabled={disabled} value={modelProvider} onChange={(event) => setModelProvider(event.target.value as ClientSettings["modelProvider"])}><option value="transformers">Transformers / OpenAI-compatible</option><option value="ollama">Ollama</option><option value="local_http">Local HTTP</option></select></label>
      <label>模型服务地址<input disabled={disabled} value={modelBaseUrl} onChange={(event) => setModelBaseUrl(event.target.value)} /></label>
      <label>模型名称<input disabled={disabled} value={modelName} onChange={(event) => setModelName(event.target.value)} /></label>
      <label>采集间隔秒<input disabled={disabled} type="number" min={10} max={300} value={captureIntervalSeconds} onChange={(event) => setCaptureIntervalSeconds(Number(event.target.value))} /></label>
      <button disabled={disabled} onClick={save}>保存设置</button>
    </section>
  );
}

function RecordsPanel({ records, reload }: { records: ActivityRecord[]; reload: () => void }) {
  async function clear() {
    await window.desktop.records.clear();
    reload();
  }

  return (
    <section className="panel records">
      <div className="sectionTitle"><h2>本地记录（今日）</h2><button className="ghost" onClick={clear}>清空</button></div>
      {records.length === 0 ? <p className="message">今日暂无本地记录</p> : records.map((record) => (
        <article className="record" key={record.id}>
          <time>{formatShanghaiTime(record.startTime)} - {formatShanghaiTime(record.endTime)} · {record.category} · {record.uploadStatus}</time>
          <strong>{record.summary}</strong>
          <span>{record.appName ?? ""}</span>
        </article>
      ))}
    </section>
  );
}

function App() {
  const [status, setStatus] = useState<RecorderStatus>();
  const [settings, setSettings] = useState<ClientSettings & Record<string, unknown>>();
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");

  async function refreshDynamic() {
    setStatus(await window.desktop.recorder.status());
    setRecords(await window.desktop.records.list(100));
  }

  async function loadInitial() {
    setStatus(await window.desktop.recorder.status());
    setSettings(await window.desktop.settings.get());
    setRecords(await window.desktop.records.list(100));
  }

  useEffect(() => {
    void loadInitial();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshDynamic();
    }, 10000);
    return () => clearInterval(id);
  }, []);

  async function action(fn: () => Promise<unknown>, label: string, key = label) {
    if (pendingAction) return;
    setMessage("");
    setPendingAction(key);
    try {
      await fn();
      setMessage(`${label}完成`);
      await refreshDynamic();
    } catch (err) {
      setMessage(String(err));
    } finally {
      setPendingAction("");
    }
  }

  const recorderState = status?.state ?? "Idle";
  const hasPendingAction = Boolean(pendingAction);
  const canStop = recorderState === "Recording" || recorderState === "Paused" || recorderState === "Error";

  return (
    <main className="app">
      <header>
        <div><h1>Activity Daily Client</h1><p>本地采集、本地模型识图摘要、最小上传、同步到远程 Ubuntu 服务端。</p></div>
        <button className="ghost" onClick={() => window.desktop.webReport.open()}>打开 Web 日报</button>
      </header>
      <StatusCards status={status} />
      <section className="toolbar panel">
        <button className={`record-action action-start ${recorderState === "Recording" ? "is-current" : ""}`} disabled={hasPendingAction || recorderState === "Recording" || recorderState === "Paused"} onClick={() => action(() => window.desktop.recorder.start(), "开始记录", "start")}>{pendingAction === "start" ? "启动中..." : "开始"}</button>
        <button className={`record-action action-pause ${recorderState === "Paused" ? "is-current" : ""}`} disabled={hasPendingAction || recorderState !== "Recording"} onClick={() => action(() => window.desktop.recorder.pause(), "暂停", "pause")}>{pendingAction === "pause" ? "暂停中..." : "暂停"}</button>
        <button className="record-action action-resume" disabled={hasPendingAction || recorderState !== "Paused"} onClick={() => action(() => window.desktop.recorder.resume(), "恢复", "resume")}>{pendingAction === "resume" ? "恢复中..." : "恢复"}</button>
        <button className={`record-action action-stop ${recorderState === "Stopped" || recorderState === "Idle" ? "is-current" : ""}`} disabled={hasPendingAction || !canStop} onClick={() => action(() => window.desktop.recorder.stop(), "停止", "stop")}>{pendingAction === "stop" ? "停止中..." : "停止"}</button>
        <button className="action-sync" disabled={hasPendingAction} onClick={() => action(() => window.desktop.sync.run(), "同步", "sync")}>{pendingAction === "sync" ? "同步中..." : "立即同步"}</button>
        <button className="ghost" disabled={hasPendingAction} onClick={() => action(() => window.desktop.model.health(), "模型检查", "health")}>{pendingAction === "health" ? "检查中..." : "检查模型"}</button>
        <button className="ghost" disabled={hasPendingAction} onClick={() => action(() => window.desktop.logs.openFolder(), "打开日志", "logs")}>打开日志</button>
      </section>
      {message && <p className="message">{message}</p>}
      <section className="grid">
        <div>
          <LoginPanel connected={Boolean(settings?.accessToken)} onDone={loadInitial} />
          <RecordsPanel records={records} reload={refreshDynamic} />
        </div>
        <SettingsPanel settings={settings} disabled={status?.state === "Recording" || pendingAction === "start" || pendingAction === "resume"} onSaved={(updated) => { setSettings(updated); void refreshDynamic(); }} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);




