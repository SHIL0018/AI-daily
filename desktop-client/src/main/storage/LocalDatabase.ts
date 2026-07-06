import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

export class LocalDatabase {
  readonly db: Database.Database;

  constructor(databasePath?: string) {
    const dir = databasePath ? path.dirname(databasePath) : path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(databasePath ?? path.join(dir, "activity_daily_client.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_activity_records (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        device_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        app_name TEXT,
        window_title TEXT,
        process_name TEXT,
        summary TEXT NOT NULL,
        category TEXT,
        confidence REAL,
        privacy_level TEXT NOT NULL DEFAULT 'normal',
        upload_status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        server_record_id TEXT,
        error_message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_activity_upload_status ON local_activity_records(upload_status);
      CREATE INDEX IF NOT EXISTS idx_local_activity_upload_retry_created ON local_activity_records(upload_status, retry_count, created_at);
      CREATE INDEX IF NOT EXISTS idx_local_activity_time ON local_activity_records(start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_local_activity_session ON local_activity_records(session_id);

      CREATE TABLE IF NOT EXISTS local_sessions (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_sync_logs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        uploaded_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        error_message TEXT
      );
    `);
  }
}

