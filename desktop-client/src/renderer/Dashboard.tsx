import { useState } from "react";
import { X } from "lucide-react";
import type { AuthStatus } from "../shared/types";
import type { RecorderActionKey } from "./controlState";
import { ClientTopBar } from "./components/ClientTopBar";
import { ControlCenter } from "./components/ControlCenter";
import { RecentRecords } from "./components/RecentRecords";
import { RecordsDrawer } from "./components/RecordsDrawer";
import { RuntimeStatusPanel } from "./components/RuntimeStatusPanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { useClientDashboard } from "./hooks/useClientDashboard";

export function Dashboard({ authStatus, onLogout }: { authStatus: AuthStatus; onLogout: () => Promise<void> }) {
  const dashboard = useClientDashboard();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const offline = !authStatus.serverReachable;
  const state = dashboard.status?.state;
  const settingsLocked = state === "Recording" || state === "Paused" || dashboard.pendingAction === "start" || dashboard.pendingAction === "resume";

  function recorderAction(action: RecorderActionKey) {
    const labels = { start: "记录已开始", pause: "记录已暂停", resume: "记录已恢复", stop: "记录已停止" };
    void dashboard.runAction(action, labels[action], () => window.desktop.recorder[action]());
  }

  if (dashboard.loading) return <main className="dashboard-loading"><div className="loading-mark"></div><p>正在加载本地控制台...</p></main>;

  return (
    <main className="client-app">
      <ClientTopBar
        online={!offline}
        email={authStatus.email}
        onOpenWeb={() => void dashboard.runAction("web-report", "", () => window.desktop.webReport.open())}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="dashboard-content">
        {dashboard.notice && <div className={`app-notice notice-${dashboard.notice.tone}`} role="status"><span>{dashboard.notice.text}</span><button type="button" title="关闭提示" onClick={() => dashboard.setNotice(undefined)}><X size={16} /></button></div>}
        <section className="control-layout surface">
          <ControlCenter status={dashboard.status} pendingAction={dashboard.pendingAction} onAction={recorderAction} />
          <RuntimeStatusPanel
            status={dashboard.status}
            offline={offline}
            pendingAction={dashboard.pendingAction}
            onModelCheck={() => void dashboard.runAction("health", "模型检查完成", () => window.desktop.model.health())}
            onSync={() => void dashboard.runAction("sync", "同步完成", () => window.desktop.sync.run())}
          />
        </section>
        <RecentRecords records={dashboard.records} onViewAll={() => setRecordsOpen(true)} />
      </div>

      <SettingsDrawer
        open={settingsOpen}
        settings={dashboard.settings}
        authStatus={authStatus}
        locked={settingsLocked}
        pendingAction={dashboard.pendingAction}
        onClose={() => setSettingsOpen(false)}
        onSave={dashboard.saveSettings}
        onLogout={onLogout}
        onOpenLogs={() => void dashboard.runAction("logs", "", () => window.desktop.logs.openFolder())}
      />
      <RecordsDrawer
        open={recordsOpen}
        records={dashboard.records}
        pendingAction={dashboard.pendingAction}
        onClose={() => setRecordsOpen(false)}
        onRefresh={dashboard.refreshDynamic}
        onClear={dashboard.clearRecords}
      />
    </main>
  );
}
