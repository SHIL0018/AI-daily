import { DEFAULT_SETTINGS } from "../../shared/constants";
import type { ClientSettings } from "../../shared/types";
import { LocalDatabase } from "./LocalDatabase";

export class SettingsRepository {
  constructor(private readonly database: LocalDatabase) {}

  getAll(): ClientSettings & Record<string, unknown> {
    const rows = this.database.db.prepare("SELECT key, value FROM local_settings").all() as { key: string; value: string }[];
    const values: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) values[row.key] = JSON.parse(row.value);
    return values as ClientSettings & Record<string, unknown>;
  }

  get<T>(key: string, fallback?: T): T {
    const row = this.database.db.prepare("SELECT value FROM local_settings WHERE key=?").get(key) as { value: string } | undefined;
    if (!row) return fallback as T;
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: unknown): void {
    this.database.db.prepare("INSERT OR REPLACE INTO local_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      key,
      JSON.stringify(value),
      new Date().toISOString()
    );
  }

  seedDefaults(): void {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      this.database.db.prepare("INSERT OR IGNORE INTO local_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
        key,
        JSON.stringify(value),
        new Date().toISOString()
      );
    }
    this.migrateLegacyModelDefaults();
  }

  private migrateLegacyModelDefaults(): void {
    const provider = this.get<string>("modelProvider", "");
    const baseUrl = this.get<string>("modelBaseUrl", "");
    const modelName = this.get<string>("modelName", "");
    if (provider === "ollama" && baseUrl === "http://127.0.0.1:11434" && modelName === "qwen3.5:0.8b") {
      this.set("modelProvider", DEFAULT_SETTINGS.modelProvider);
      this.set("modelBaseUrl", DEFAULT_SETTINGS.modelBaseUrl);
      this.set("modelName", DEFAULT_SETTINGS.modelName);
    }
  }
}