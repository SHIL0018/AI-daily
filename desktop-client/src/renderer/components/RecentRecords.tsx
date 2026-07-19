import { ArrowRight } from "lucide-react";
import type { ActivityRecord } from "../../shared/types";
import { formatShanghaiTime } from "../../shared/time";

export function RecentRecords({ records, onViewAll }: { records: ActivityRecord[]; onViewAll: () => void }) {
  const recent = records.slice(0, 3);
  return (
    <section className="recent-records surface">
      <header className="section-header"><div><p className="section-kicker">RECENT ACTIVITY</p><h2>最近活动</h2></div><button className="link-button" type="button" onClick={onViewAll}>查看全部<ArrowRight size={16} /></button></header>
      {recent.length ? <div className="recent-list">{recent.map((record) => (
        <article className="recent-record" key={record.id}>
          <time>{formatShanghaiTime(record.startTime)}<small>{formatShanghaiTime(record.endTime)}</small></time>
          <span className="category-badge">{record.category}</span>
          <div><strong>{record.summary}</strong><small>{record.appName || "未知应用"}</small></div>
          <span className={`upload-state upload-${record.uploadStatus}`}>{record.uploadStatus === "synced" ? "已同步" : record.uploadStatus === "failed" ? "失败" : "待同步"}</span>
        </article>
      ))}</div> : <p className="empty-state">今天还没有本地活动记录。开始记录后，最近活动会显示在这里。</p>}
    </section>
  );
}
