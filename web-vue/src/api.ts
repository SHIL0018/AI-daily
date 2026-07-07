import { useAuthStore } from "./stores/auth";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = useAuthStore();
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(init.headers || {})
    }
  });
  if (response.status === 401 && auth.refreshToken) {
    const refreshed = await auth.refresh();
    if (refreshed) return apiRequest<T>(path, init);
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = body?.detail?.message || body?.message || "请求失败";
    throw new Error(message);
  }
  return body.data as T;
}

export function todayInShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0 分钟";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}