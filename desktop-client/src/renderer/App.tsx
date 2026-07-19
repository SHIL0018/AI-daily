import { useCallback, useEffect, useState } from "react";
import type { AuthStatus } from "../shared/types";
import { canAutoEnterDashboard } from "./authAccess";
import { AuthGate } from "./components/AuthGate";
import { Dashboard } from "./Dashboard";

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>();
  const [checking, setChecking] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);

  const refreshAuth = useCallback(async () => {
    const next = await window.desktop.auth.status();
    setAuthStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshAuth()
      .then((next) => setAccessGranted(canAutoEnterDashboard(next)))
      .catch(() => setAuthStatus({ hasSession: false, canUseOffline: false, serverReachable: false }))
      .finally(() => setChecking(false));
  }, [refreshAuth]);

  useEffect(() => {
    if (!accessGranted) return;
    const timer = window.setInterval(() => {
      void refreshAuth().then((next) => {
        if (!next.hasSession) setAccessGranted(false);
      }).catch(() => setAuthStatus((current) => current ? { ...current, serverReachable: false } : current));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [accessGranted, refreshAuth]);

  async function logout() {
    await window.desktop.auth.logout();
    setAccessGranted(false);
    setAuthStatus(await window.desktop.auth.status());
  }

  if (!accessGranted) {
    return <AuthGate
      status={authStatus}
      checking={checking}
      onOffline={() => setAccessGranted(true)}
      onAuthenticated={(next) => { setAuthStatus(next); setAccessGranted(true); }}
    />;
  }

  return <Dashboard authStatus={authStatus ?? { hasSession: true, canUseOffline: true, serverReachable: false }} onLogout={logout} />;
}
