import { BarChart3, ExternalLink, Settings, Wifi, WifiOff } from "lucide-react";

export function ClientTopBar({ online, email, onOpenWeb, onOpenSettings }: {
  online: boolean;
  email?: string;
  onOpenWeb: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="client-topbar">
      <div className="client-brand"><span><BarChart3 size={21} /></span><div><strong>Activity Daily</strong><small>本地记录控制台</small></div></div>
      <div className="topbar-actions">
        <span className={`connection-badge ${online ? "online" : "offline"}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? "服务端已连接" : "离线记录"}</span>
        {email && <span className="account-email">{email}</span>}
        <button className="secondary-button" type="button" onClick={onOpenWeb}><ExternalLink size={17} />打开 Web 日报</button>
        <button className="icon-button" type="button" title="设置" onClick={onOpenSettings}><Settings size={19} /></button>
      </div>
    </header>
  );
}
