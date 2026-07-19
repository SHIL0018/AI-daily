import { useCallback, useEffect, useState } from "react";
import type { ActivityRecord, ClientSettings, RecorderStatus } from "../../shared/types";
import { friendlyError } from "../formatters";

export type DashboardSettings = ClientSettings & Record<string, unknown>;
export type Notice = { tone: "success" | "error" | "info"; text: string };

export function useClientDashboard() {
  const [status, setStatus] = useState<RecorderStatus>();
  const [settings, setSettings] = useState<DashboardSettings>();
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [pendingAction, setPendingAction] = useState("");
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);

  const refreshDynamic = useCallback(async () => {
    const [nextStatus, nextRecords] = await Promise.all([
      window.desktop.recorder.status(),
      window.desktop.records.list(500)
    ]);
    setStatus(nextStatus);
    setRecords(nextRecords);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextSettings, nextRecords] = await Promise.all([
        window.desktop.recorder.status(),
        window.desktop.settings.get(),
        window.desktop.records.list(500)
      ]);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setRecords(nextRecords);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshDynamic().catch((error) => setNotice({ tone: "error", text: friendlyError(error) }));
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadInitial, refreshDynamic]);

  const runAction = useCallback(async (key: string, successText: string, task: () => Promise<unknown>) => {
    if (pendingAction) return;
    setPendingAction(key);
    setNotice(undefined);
    try {
      await task();
      if (successText) setNotice({ tone: "success", text: successText });
      await refreshDynamic();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
    } finally {
      setPendingAction("");
    }
  }, [pendingAction, refreshDynamic]);

  const saveSettings = useCallback(async (patch: Partial<ClientSettings>) => {
    if (pendingAction) return false;
    setPendingAction("save-settings");
    setNotice(undefined);
    try {
      const updated = await window.desktop.settings.update(patch);
      setSettings(updated);
      setNotice({ tone: "success", text: "设置已保存" });
      await refreshDynamic();
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
      return false;
    } finally {
      setPendingAction("");
    }
  }, [pendingAction, refreshDynamic]);

  const clearRecords = useCallback(async () => {
    await runAction("clear-records", "本地记录已清空", () => window.desktop.records.clear());
  }, [runAction]);

  return {
    status,
    settings,
    records,
    pendingAction,
    notice,
    loading,
    setNotice,
    refreshDynamic,
    runAction,
    saveSettings,
    clearRecords
  };
}
