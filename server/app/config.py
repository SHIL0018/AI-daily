from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("APP_DATA_DIR", ROOT_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings:
    app_name = "Activity Daily Report"
    database_path = Path(os.getenv("APP_DATABASE_PATH", DATA_DIR / "app.db"))
    token_secret = os.getenv("APP_TOKEN_SECRET", "dev-change-me")
    access_token_minutes = int(os.getenv("ACCESS_TOKEN_MINUTES", "120"))
    refresh_token_days = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))

    deepseek_base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_default_model = os.getenv("DEEPSEEK_DEFAULT_MODEL", "deepseek-v4-flash")
    deepseek_deep_model = os.getenv("DEEPSEEK_DEEP_ANALYSIS_MODEL", "deepseek-v4-pro")
    deepseek_timeout_seconds = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "120"))
    deepseek_max_retries = int(os.getenv("DEEPSEEK_MAX_RETRIES", "2"))


settings = Settings()
