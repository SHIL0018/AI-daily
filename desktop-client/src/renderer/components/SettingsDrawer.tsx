import { useEffect, useState } from "react";
import { FileText, LogOut, Mail, Save, Server, SlidersHorizontal, Sparkles } from "lucide-react";
import type { AuthStatus, ClientSettings } from "../../shared/types";
import { friendlyError } from "../formatters";
import type { DashboardSettings } from "../hooks/useClientDashboard";
import { Drawer } from "./Drawer";

type SettingsDraft = Pick<ClientSettings, "serverUrl" | "modelProvider" | "modelBaseUrl" | "modelName" | "captureIntervalSeconds">;

function toDraft(settings?: DashboardSettings): SettingsDraft {
  return {
    serverUrl: settings?.serverUrl ?? "",
    modelProvider: settings?.modelProvider ?? "transformers",
    modelBaseUrl: settings?.modelBaseUrl ?? "",
    modelName: settings?.modelName ?? "",
    captureIntervalSeconds: settings?.captureIntervalSeconds ?? 30
  };
}

export function SettingsDrawer({ open, settings, authStatus, locked, pendingAction, onClose, onSave, onLogout, onOpenLogs }: {
  open: boolean;
  settings?: DashboardSettings;
  authStatus: AuthStatus;
  locked: boolean;
  pendingAction: string;
  onClose: () => void;
  onSave: (patch: Partial<ClientSettings>) => Promise<boolean>;
  onLogout: () => Promise<void>;
  onOpenLogs: () => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [localError, setLocalError] = useState("");
  const saving = pendingAction === "save-settings";
  const busy = Boolean(pendingAction);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(settings));
      setLocalError("");
    }
  }, [open, settings]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked || saving) return;
    setLocalError("");
    const saved = await onSave({ ...draft, captureIntervalSeconds: Number(draft.captureIntervalSeconds) });
    if (saved) setDraft(toDraft({ ...settings, ...draft } as DashboardSettings));
  }

  async function logout() {
    try {
      setLocalError("");
      await onLogout();
    } catch (error) {
      setLocalError(friendlyError(error));
    }
  }

  return (
    <Drawer open={open} title="设置" onClose={onClose}>
      <form className="settings-form" onSubmit={submit}>
        {locked && <p className="locked-notice">记录运行或暂停期间不能修改设置。请先停止记录。</p>}

        <section className="settings-section">
          <div className="settings-section-title"><Mail size={18} /><div><h3>账号与连接</h3><p>当前登录身份和远程服务地址</p></div></div>
          <div className="account-row"><div><span>当前账号</span><strong>{authStatus.email || "已登录账号"}</strong></div><span className={`connection-dot ${authStatus.serverReachable ? "online" : "offline"}`}>{authStatus.serverReachable ? "在线" : "离线"}</span></div>
          <label>服务端地址<input disabled={locked || saving} value={draft.serverUrl} onChange={(event) => setDraft({ ...draft, serverUrl: event.target.value })} /></label>
          <button className="danger-text-button" type="button" disabled={locked || busy} onClick={() => void logout()}><LogOut size={16} />退出并重新登录</button>
        </section>

        <section className="settings-section">
          <div className="settings-section-title"><Sparkles size={18} /><div><h3>本地模型</h3><p>屏幕识图与摘要服务</p></div></div>
          <label>Provider<select disabled={locked || saving} value={draft.modelProvider} onChange={(event) => setDraft({ ...draft, modelProvider: event.target.value as ClientSettings["modelProvider"] })}><option value="transformers">Transformers / OpenAI-compatible</option><option value="ollama">Ollama</option><option value="local_http">Local HTTP</option></select></label>
          <label>模型服务地址<input disabled={locked || saving} value={draft.modelBaseUrl} onChange={(event) => setDraft({ ...draft, modelBaseUrl: event.target.value })} /></label>
          <label>模型名称<input disabled={locked || saving} value={draft.modelName} onChange={(event) => setDraft({ ...draft, modelName: event.target.value })} /></label>
        </section>

        <section className="settings-section">
          <div className="settings-section-title"><SlidersHorizontal size={18} /><div><h3>采集</h3><p>控制活动采集频率</p></div></div>
          <label>采集间隔（秒）<input disabled={locked || saving} type="number" min={settings?.minCaptureIntervalSeconds ?? 10} max={settings?.maxCaptureIntervalSeconds ?? 300} value={draft.captureIntervalSeconds} onChange={(event) => setDraft({ ...draft, captureIntervalSeconds: Number(event.target.value) })} /></label>
        </section>

        <section className="settings-section diagnostics-section">
          <div className="settings-section-title"><Server size={18} /><div><h3>诊断</h3><p>排查模型或同步问题</p></div></div>
          <button className="secondary-button" type="button" onClick={onOpenLogs}><FileText size={16} />打开日志目录</button>
        </section>

        {localError && <p className="error-message" role="alert">{localError}</p>}
        <div className="drawer-footer"><button className="primary-button" disabled={locked || saving} type="submit"><Save size={17} />{saving ? "保存中..." : "保存设置"}</button></div>
      </form>
    </Drawer>
  );
}
