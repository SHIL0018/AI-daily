import { RefreshCw, RotateCw } from "lucide-react";
import type { RecorderStatus } from "../../shared/types";

const recorderLabels = { Idle: "准备就绪", Recording: "记录中", Paused: "已暂停", Stopped: "已停止", Error: "异常" } as const;
const modelLabels = { ok: "可用", unavailable: "不可用", error: "异常" } as const;

export function RuntimeStatusPanel({ status, offline, pendingAction, onModelCheck, onSync }: {
  status?: RecorderStatus;
  offline: boolean;
  pendingAction: string;
  onModelCheck: () => void;
  onSync: () => void;
}) {
  const recorderState = status?.state ?? "Idle";
  const modelState = status?.model.status ?? "unavailable";
  const syncFailed = Boolean(status?.sync.failed || status?.sync.lastError);
  const syncLabel = offline ? "等待联网" : pendingAction === "sync" ? "同步中" : syncFailed ? "同步失败" : status?.sync.pending ? `${status.sync.pending} 条待同步` : "无任务";

  return (
    <aside className="runtime-panel">
      <div className="runtime-heading"><p className="section-kicker">SYSTEM STATUS</p><h2>运行状态</h2></div>
      <div className="runtime-row">
        <i className={`status-indicator recorder-${recorderState.toLowerCase()}`}></i>
        <div><span>记录器</span><strong>{recorderLabels[recorderState]}</strong></div>
      </div>
      <div className="runtime-row">
        <i className={`status-indicator model-${modelState}`}></i>
        <div><span>本地模型</span><strong>{pendingAction === "health" ? "检查中" : modelLabels[modelState]}</strong></div>
        <button className="row-action" type="button" title="重新检查模型" disabled={Boolean(pendingAction)} onClick={onModelCheck}><RefreshCw size={16} className={pendingAction === "health" ? "spinning" : ""} /></button>
      </div>
      <div className="runtime-row">
        <i className={`status-indicator ${syncFailed ? "sync-error" : offline ? "sync-waiting" : "sync-ok"}`}></i>
        <div><span>同步队列</span><strong>{syncLabel}</strong></div>
        <button className="row-action" type="button" title="立即同步" disabled={offline || Boolean(pendingAction)} onClick={onSync}><RotateCw size={16} className={pendingAction === "sync" ? "spinning" : ""} /></button>
      </div>
      <p className={`runtime-note ${offline ? "offline" : ""}`}>{offline ? "当前处于离线模式。活动会保存在本机，联网后可继续同步。" : "客户端会在后台保持记录，并按同步队列上传结构化活动。"}</p>
    </aside>
  );
}
