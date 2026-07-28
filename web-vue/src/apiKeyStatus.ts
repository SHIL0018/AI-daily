import { apiRequest } from "./api";
import { useAuthStore } from "./stores/auth";

export type ApiKeyStatus = { configured: boolean; key_hint: string; updated_at?: string };

const cache = new Map<string, ApiKeyStatus>();
const pending = new Map<string, Promise<ApiKeyStatus>>();

export function getApiKeyStatus(force = false): Promise<ApiKeyStatus> {
  const userKey = useAuthStore().email || "current-user";
  if (!force && cache.has(userKey)) return Promise.resolve(cache.get(userKey)!);
  if (!force && pending.has(userKey)) return pending.get(userKey)!;
  const request = apiRequest<ApiKeyStatus>("/api/v1/api-keys/deepseek")
    .then((status) => {
      cache.set(userKey, status);
      return status;
    })
    .finally(() => pending.delete(userKey));
  pending.set(userKey, request);
  return request;
}

export function cacheApiKeyStatus(status: ApiKeyStatus): void {
  cache.set(useAuthStore().email || "current-user", status);
}

export function clearApiKeyStatusCache(): void {
  cache.clear();
  pending.clear();
}
