from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["APP_DATA_DIR"] = tempfile.mkdtemp(prefix="daily-mvp-")
os.environ["APP_TOKEN_SECRET"] = "test-secret"
os.environ["DEEPSEEK_TIMEOUT_SECONDS"] = "1"
os.environ["DEEPSEEK_MAX_RETRIES"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from server.app.main import app  # noqa: E402
from server.app.database import init_db  # noqa: E402

init_db()
client = TestClient(app)


def assert_ok(response):
    assert response.status_code < 400, response.text
    data = response.json()
    assert data["success"] is True
    return data["data"]


def main() -> None:
    assert_ok(client.post("/api/v1/auth/register", json={"email": "smoke-test@example.com", "username": "smoke-test", "password": "smoke-test-pass"}))
    login = assert_ok(client.post("/api/v1/auth/login", json={"email": "smoke-test@example.com", "password": "smoke-test-pass"}))
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    device = assert_ok(
        client.post(
            "/api/v1/devices",
            headers=headers,
            json={"device_name": "Smoke Device", "os_type": "Windows", "client_version": "test"},
        )
    )
    records = [
        {
            "client_record_id": "local-1",
            "session_id": "session-1",
            "start_time": "2026-06-30T09:00:00+08:00",
            "end_time": "2026-06-30T10:00:00+08:00",
            "duration_seconds": 3600,
            "app_name": "Visual Studio Code",
            "summary": "编写后端活动记录接口",
            "category": "编程开发",
            "confidence": 0.88,
            "privacy_level": "normal",
        },
        {
            "client_record_id": "local-2",
            "session_id": "session-1",
            "start_time": "2026-06-30T10:10:00+08:00",
            "end_time": "2026-06-30T10:40:00+08:00",
            "duration_seconds": 1800,
            "app_name": "Chrome",
            "summary": "查阅技术方案资料",
            "category": "信息检索",
            "confidence": 0.8,
            "privacy_level": "normal",
        },
    ]
    upload = assert_ok(client.post("/api/v1/activity-records/batch", headers=headers, json={"device_id": device["device_id"], "records": records}))
    assert upload["accepted"] == 2
    duplicate = assert_ok(client.post("/api/v1/activity-records/batch", headers=headers, json={"device_id": device["device_id"], "records": records}))
    assert duplicate["duplicated"] == 2
    report = assert_ok(client.get("/api/v1/daily-reports/2026-06-30?include_ai_analysis=true", headers=headers))
    assert report["total_tracked_seconds"] == 5400
    missing_key = client.post("/api/v1/daily-reports/2026-06-30/ai-analysis", headers=headers, json={"force_regenerate": True})
    assert missing_key.status_code == 400, missing_key.text
    assert missing_key.json()["detail"]["code"] == "API_KEY_REQUIRED"
    assert_ok(client.put("/api/v1/api-keys/deepseek", headers=headers, json={"api_key": "sk-test-1234567890"}))
    job = assert_ok(client.post("/api/v1/daily-reports/2026-06-30/ai-analysis", headers=headers, json={"force_regenerate": True}))
    status = assert_ok(client.get(f"/api/v1/ai-analysis-jobs/{job['job_id']}", headers=headers))
    assert status["status"] in {"fallback", "succeeded", "running", "pending"}
    listed = assert_ok(client.get("/api/v1/activity-records?date=2026-06-30", headers=headers))
    first_id = listed["records"][0]["id"]
    assert_ok(client.patch(f"/api/v1/activity-records/{first_id}", headers=headers, json={"summary": "调试后端活动记录接口"}))
    assert_ok(client.delete(f"/api/v1/activity-records/{first_id}", headers=headers))
    export = client.get("/api/v1/daily-reports/2026-06-30/export?format=markdown", headers=headers)
    assert export.status_code == 200
    assert "日报" in export.text or "主要" in export.text
    print("smoke test passed")


if __name__ == "__main__":
    main()
