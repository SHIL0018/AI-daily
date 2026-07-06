from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import settings


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            );

            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                device_name TEXT NOT NULL,
                os_type TEXT NOT NULL,
                os_version TEXT,
                client_version TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
            CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(user_id, status);

            CREATE TABLE IF NOT EXISTS activity_records (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                device_id TEXT NOT NULL REFERENCES devices(id),
                client_record_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                app_name TEXT,
                window_title TEXT,
                process_name TEXT,
                summary TEXT NOT NULL,
                category TEXT NOT NULL,
                confidence REAL,
                privacy_level TEXT NOT NULL DEFAULT 'normal',
                source TEXT NOT NULL DEFAULT 'client',
                metadata TEXT,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, device_id, client_record_id)
            );
            CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_records(user_id, start_time, end_time);
            CREATE INDEX IF NOT EXISTS idx_activity_device ON activity_records(device_id);
            CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_records(user_id, category);
            CREATE INDEX IF NOT EXISTS idx_activity_not_deleted ON activity_records(user_id, start_time, is_deleted);

            CREATE TABLE IF NOT EXISTS activity_record_edits (
                id TEXT PRIMARY KEY,
                activity_record_id TEXT NOT NULL REFERENCES activity_records(id),
                user_id TEXT NOT NULL REFERENCES users(id),
                old_summary TEXT,
                new_summary TEXT,
                old_category TEXT,
                new_category TEXT,
                old_start_time TEXT,
                new_start_time TEXT,
                old_end_time TEXT,
                new_end_time TEXT,
                edit_reason TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                report_date TEXT NOT NULL,
                timezone TEXT NOT NULL,
                title TEXT,
                overview TEXT,
                highlights TEXT,
                timeline TEXT,
                category_stats TEXT,
                app_stats TEXT,
                suggestions TEXT,
                user_note TEXT,
                total_tracked_seconds INTEGER NOT NULL DEFAULT 0,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                idle_seconds INTEGER NOT NULL DEFAULT 0,
                private_seconds INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'generated',
                is_stale INTEGER NOT NULL DEFAULT 0,
                ai_analysis_status TEXT NOT NULL DEFAULT 'none',
                ai_analysis_job_id TEXT,
                ai_title TEXT,
                ai_summary TEXT,
                ai_highlights TEXT,
                ai_timeline_commentary TEXT,
                ai_focus_analysis TEXT,
                ai_suggestions TEXT,
                ai_risk_flags TEXT,
                ai_model_name TEXT,
                ai_generated_at TEXT,
                generated_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, report_date)
            );
            CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);
            CREATE INDEX IF NOT EXISTS idx_daily_reports_stale ON daily_reports(user_id, is_stale);

            CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                report_id TEXT REFERENCES daily_reports(id),
                analysis_type TEXT NOT NULL DEFAULT 'daily',
                report_date TEXT,
                date_range_start TEXT,
                date_range_end TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                mode TEXT NOT NULL DEFAULT 'standard',
                model_provider TEXT NOT NULL DEFAULT 'deepseek',
                model_name TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
                input_hash TEXT NOT NULL,
                prompt_version TEXT NOT NULL,
                sanitized_payload TEXT,
                analysis_result TEXT,
                input_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                estimated_cost REAL,
                error_code TEXT,
                error_message TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                cached INTEGER NOT NULL DEFAULT 0,
                started_at TEXT,
                finished_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_date ON ai_analysis_jobs(user_id, report_date);
            CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_analysis_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_ai_jobs_input_hash ON ai_analysis_jobs(user_id, analysis_type, input_hash);

            CREATE TABLE IF NOT EXISTS ai_analysis_token_usage (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                job_id TEXT REFERENCES ai_analysis_jobs(id),
                usage_date TEXT NOT NULL,
                model_provider TEXT NOT NULL DEFAULT 'deepseek',
                model_name TEXT NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                estimated_cost REAL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_api_keys (
                user_id TEXT NOT NULL REFERENCES users(id),
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL,
                key_hint TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, provider)
            );
            CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);
            """
        )
