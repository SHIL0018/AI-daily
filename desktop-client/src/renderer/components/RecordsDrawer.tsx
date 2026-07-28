import { RefreshCw, Trash2 } from "lucide-react";
import type { ActivityRecordPage } from "../../shared/types";
import { formatShanghaiTime } from "../../shared/time";
import { formatDuration } from "../formatters";
import { Drawer } from "./Drawer";

export function RecordsDrawer({ open, recordPage, pendingAction, onClose, onPage, onClear }: {
  open: boolean;
  recordPage: ActivityRecordPage;
  pendingAction: string;
  onClose: () => void;
  onPage: (page: number) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const busy = Boolean(pendingAction);
  const records = recordPage.items;

  async function clearAll() {
    if (!window.confirm("将清空本机保存的全部活动记录，且无法恢复。确认继续？")) return;
    await onClear();
  }

  return (
    <Drawer open={open} title="本地记录" wide onClose={onClose}>
      <div className="records-drawer-toolbar">
        <span>共 {recordPage.totalItems} 条</span>
        <div><button className="secondary-button" type="button" disabled={busy} onClick={() => void onPage(recordPage.page)}><RefreshCw size={16} />刷新</button><button className="danger-button" type="button" disabled={busy || !recordPage.totalItems} onClick={() => void clearAll()}><Trash2 size={16} />清空全部</button></div>
      </div>
      {records.length ? <div className="drawer-record-list">{records.map((record) => (
        <article className="drawer-record" key={record.id}>
          <div className="drawer-record-time"><strong>{formatShanghaiTime(record.startTime)}</strong><span>至 {formatShanghaiTime(record.endTime)}</span></div>
          <div className="drawer-record-body"><div><span className="category-badge">{record.category}</span><small>{record.appName || "未知应用"}</small></div><p>{record.summary}</p></div>
          <div className="drawer-record-meta"><strong>{formatDuration(record.durationSeconds)}</strong><span>{record.uploadStatus === "synced" ? "已同步" : record.uploadStatus === "failed" ? "同步失败" : "待同步"}</span></div>
        </article>
      ))}</div> : <p className="empty-state">今天还没有本地活动记录。</p>}
      {recordPage.totalPages > 1 && <nav className="drawer-pagination" aria-label="本地记录分页">
        <button className="secondary-button" type="button" disabled={busy || recordPage.page <= 1} onClick={() => void onPage(recordPage.page - 1)}>上一页</button>
        <span>{recordPage.page} / {recordPage.totalPages}</span>
        <button className="secondary-button" type="button" disabled={busy || recordPage.page >= recordPage.totalPages} onClick={() => void onPage(recordPage.page + 1)}>下一页</button>
      </nav>}
    </Drawer>
  );
}
