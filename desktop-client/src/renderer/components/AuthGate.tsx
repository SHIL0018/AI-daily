import { useState } from "react";
import { ArrowRight, BarChart3, LockKeyhole, WifiOff } from "lucide-react";
import type { AuthStatus } from "../../shared/types";
import { friendlyError } from "../formatters";

export function AuthGate({ status, checking, onAuthenticated, onOffline }: {
  status?: AuthStatus;
  checking: boolean;
  onAuthenticated: (status: AuthStatus) => void;
  onOffline: () => void;
}) {
  const [email, setEmail] = useState(status?.email ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await window.desktop.auth.login(email.trim(), password);
      await window.desktop.auth.registerDevice();
      onAuthenticated(await window.desktop.auth.status());
    } catch (submitError) {
      setPassword("");
      setError(friendlyError(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-context">
        <div className="auth-brand"><span><BarChart3 size={22} /></span><strong>Activity Daily</strong></div>
        <div className="auth-copy">
          <p className="section-kicker">个人活动记录</p>
          <h1>让记录安静运行，<br />把注意力留给正在做的事。</h1>
          <p>登录后即可启动本地记录。屏幕摘要由本地模型完成，结构化活动按同步队列上传。</p>
        </div>
        <div className="auth-rhythm" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-head">
            <span><LockKeyhole size={20} /></span>
            <div><h2>{checking ? "正在检查连接" : "登录客户端"}</h2><p>使用 Web 端注册的账号</p></div>
          </div>
          <label>邮箱<input disabled={loading || checking} value={email} type="email" autoComplete="email" required onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
          <label>密码<input disabled={loading || checking} value={password} type="password" autoComplete="current-password" required onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" /></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading || checking} type="submit">{checking ? "检查中..." : loading ? "正在登录..." : "登录并进入"}<ArrowRight size={18} /></button>
          {!checking && status?.canUseOffline && !status.serverReachable && (
            <button className="offline-button" type="button" onClick={onOffline}><WifiOff size={17} />离线进入</button>
          )}
          {!checking && !status?.serverReachable && <p className="auth-hint">服务器暂时不可用；只有已在本机登录过的账号可以离线进入。</p>}
        </form>
      </section>
    </main>
  );
}
