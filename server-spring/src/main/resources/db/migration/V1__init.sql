CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_login_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    device_name VARCHAR(255) NOT NULL,
    os_type VARCHAR(64) NOT NULL,
    os_version VARCHAR(128),
    client_version VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(user_id, status);

CREATE TABLE IF NOT EXISTS activity_records (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    device_id VARCHAR(36) NOT NULL REFERENCES devices(id),
    client_record_id VARCHAR(128) NOT NULL,
    session_id VARCHAR(128) NOT NULL,
    start_time VARCHAR(64) NOT NULL,
    end_time VARCHAR(64) NOT NULL,
    duration_seconds INTEGER NOT NULL,
    app_name TEXT,
    window_title TEXT,
    process_name TEXT,
    summary TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    confidence DOUBLE PRECISION,
    privacy_level VARCHAR(32) NOT NULL DEFAULT 'normal',
    source VARCHAR(32) NOT NULL DEFAULT 'client',
    metadata TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_activity_client_record UNIQUE(user_id, device_id, client_record_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_records(user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_activity_device ON activity_records(device_id);
CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_records(user_id, category);
CREATE INDEX IF NOT EXISTS idx_activity_not_deleted ON activity_records(user_id, start_time, is_deleted);

CREATE TABLE IF NOT EXISTS activity_record_edits (
    id VARCHAR(36) PRIMARY KEY,
    activity_record_id VARCHAR(36) NOT NULL REFERENCES activity_records(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    old_summary TEXT,
    new_summary TEXT,
    old_category VARCHAR(64),
    new_category VARCHAR(64),
    old_start_time VARCHAR(64),
    new_start_time VARCHAR(64),
    old_end_time VARCHAR(64),
    new_end_time VARCHAR(64),
    edit_reason TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_reports (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    report_date VARCHAR(10) NOT NULL,
    timezone VARCHAR(64) NOT NULL,
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
    status VARCHAR(32) NOT NULL DEFAULT 'generated',
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    ai_analysis_status VARCHAR(32) NOT NULL DEFAULT 'none',
    ai_analysis_job_id VARCHAR(36),
    ai_title TEXT,
    ai_summary TEXT,
    ai_highlights TEXT,
    ai_timeline_commentary TEXT,
    ai_focus_analysis TEXT,
    ai_suggestions TEXT,
    ai_risk_flags TEXT,
    ai_model_name VARCHAR(128),
    ai_generated_at TIMESTAMP,
    generated_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_daily_report_user_date UNIQUE(user_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_stale ON daily_reports(user_id, is_stale);

CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    report_id VARCHAR(36) REFERENCES daily_reports(id),
    analysis_type VARCHAR(32) NOT NULL DEFAULT 'daily',
    report_date VARCHAR(10),
    date_range_start VARCHAR(10),
    date_range_end VARCHAR(10),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    mode VARCHAR(32) NOT NULL DEFAULT 'standard',
    model_provider VARCHAR(32) NOT NULL DEFAULT 'deepseek',
    model_name VARCHAR(128) NOT NULL DEFAULT 'deepseek-v4-flash',
    input_hash VARCHAR(64) NOT NULL,
    prompt_version VARCHAR(32) NOT NULL,
    sanitized_payload TEXT,
    analysis_result TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost DOUBLE PRECISION,
    error_code VARCHAR(64),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    cached BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_date ON ai_analysis_jobs(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_input_hash ON ai_analysis_jobs(user_id, analysis_type, input_hash);

CREATE TABLE IF NOT EXISTS ai_analysis_token_usage (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    job_id VARCHAR(36) REFERENCES ai_analysis_jobs(id),
    usage_date VARCHAR(10) NOT NULL,
    model_provider VARCHAR(32) NOT NULL DEFAULT 'deepseek',
    model_name VARCHAR(128) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost DOUBLE PRECISION,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS user_api_keys (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    provider VARCHAR(64) NOT NULL,
    api_key_ciphertext TEXT NOT NULL,
    key_hint VARCHAR(64),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);