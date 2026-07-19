import { Pause, Play, RotateCcw, Square } from "lucide-react";
import type { RecorderStatus } from "../../shared/types";
import { getRecorderControlState, type RecorderActionKey } from "../controlState";
import { formatDuration, formatInferenceTime } from "../formatters";

const actionIcons = { start: Play, pause: Pause, resume: RotateCcw, stop: Square } as const;

export function ControlCenter({ status, pendingAction, onAction }: {
  status?: RecorderStatus;
  pendingAction: string;
  onAction: (action: RecorderActionKey) => void;
}) {
  const state = status?.state ?? "Idle";
  const control = getRecorderControlState(state);
  const PrimaryIcon = actionIcons[control.primary];
  const busy = ["start", "pause", "resume", "stop"].includes(pendingAction);
  const primaryPending = pendingAction === control.primary;
  const inference = status?.inference;
  const inferenceText = inference?.inProgress
    ? "推理中..."
    : inference?.count
      ? formatInferenceTime(inference.averageMs)
      : "等待首次推理";

  return (
    <section className={`control-center state-${state.toLowerCase()}`}>
      <div className="control-main">
        <p className="control-state">{state === "Recording" ? "记录正在运行" : state === "Paused" ? "记录已暂停" : state === "Error" ? "记录发生异常" : "记录器准备就绪"}</p>
        <button className="primary-control" type="button" disabled={busy} onClick={() => onAction(control.primary)}>
          <PrimaryIcon size={29} fill="currentColor" />
          <strong>{primaryPending ? "处理中..." : control.primaryLabel}</strong>
          <span>{control.helperText}</span>
        </button>
        <div className="secondary-control-slot">
          {control.showStop && <button className="stop-button" type="button" disabled={busy} onClick={() => onAction("stop")}><Square size={15} fill="currentColor" />{pendingAction === "stop" ? "停止中..." : "停止记录"}</button>}
        </div>
        <dl className="control-metrics">
          <div><dt>今日时长</dt><dd>{formatDuration(status?.todaySeconds ?? 0)}</dd></div>
          <div><dt>平均推理</dt><dd>{inferenceText}</dd><small>{inference?.count ? `${inference.count} 次` : "真实模型调用"}</small></div>
          <div><dt>待同步</dt><dd>{status?.sync.pending ?? 0}</dd><small>{status?.sync.failed ? `${status.sync.failed} 条失败` : "队列正常"}</small></div>
        </dl>
        {status?.errorMessage && <p className="control-error">{status.errorMessage}</p>}
      </div>
    </section>
  );
}
