from __future__ import annotations

import csv
import io
import json
from typing import Annotated, Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import ROOT_DIR, settings
from .database import get_db, init_db
from .security import create_token, decode_token, hash_password, iso_now, verify_password
from .services import (
    CATEGORIES,
    PRIVACY_LEVELS,
    build_ai_payload,
    date_from_iso,
    format_markdown_report,
    generate_daily_report,
    get_daily_report,
    get_user_api_key,
    json_dumps,
    json_loads,
    mark_report_stale,
    new_id,
    redact_text,
    run_ai_job,
    stable_hash,
    validate_no_raw_sensitive_fields,
)

app = FastAPI(title=settings.app_name)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RegisterRequest(BaseModel):
    email: str
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str


class DeviceCreate(BaseModel):
    device_name: str
    os_type: str
    os_version: str | None = None
    client_version: str | None = None


class DeviceUpdate(BaseModel):
    status: str


class ActivityRecordIn(BaseModel):
    client_record_id: str
    session_id: str
    start_time: str
    end_time: str
    duration_seconds: int = Field(gt=0)
    app_name: str | None = None
    window_title: str | None = None
    process_name: str | None = None
    summary: str
    category: str
    confidence: float | None = None
    privacy_level: str = "normal"
    metadata: dict[str, Any] | None = None


class ActivityBatch(BaseModel):
    device_id: str
    records: list[ActivityRecordIn] = Field(max_length=100)


class ActivityPatch(BaseModel):
    summary: str | None = None
    category: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    app_name: str | None = None


class ReportPatch(BaseModel):
    user_note: str


class AiAnalysisRequest(BaseModel):
    analysis_type: str = "daily"
    mode: str = "standard"
    force_regenerate: bool = False
    model: str | None = None


class ApiKeyRequest(BaseModel):
    api_key: str = Field(min_length=1, max_length=512)


def ok(data: Any = None) -> dict[str, Any]:
    return {"success": True, "data": data if data is not None else {}}


def api_key_hint(api_key: str) -> str:
    cleaned = api_key.strip()
    if len(cleaned) <= 10:
        return "*" * len(cleaned)
    return f"{cleaned[:6]}...{cleaned[-4:]}"


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "missing bearer token"})
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token, "access")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": str(exc)}) from exc
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE id=? AND status='active'", (payload["sub"],)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "user not found"})
    return user


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, Any]:
    return ok({"status": "ok", "database": str(settings.database_path)})


@app.post("/api/v1/auth/register")
def register(body: RegisterRequest) -> dict[str, Any]:
    user_id = new_id()
    now = iso_now()
    try:
        with get_db() as db:
            db.execute(
                """
                INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, body.email.lower(), body.username, hash_password(body.password), now, now),
            )
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "email exists or invalid params"}) from exc
    return ok({"user_id": user_id})


@app.post("/api/v1/auth/login")
def login(body: LoginRequest) -> dict[str, Any]:
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email=? AND status='active'", (body.email.lower(),)).fetchone()
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "邮箱或密码不正确"})
        now = iso_now()
        db.execute("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", (now, now, user["id"]))
    return ok({"access_token": create_token(user["id"], "access"), "refresh_token": create_token(user["id"], "refresh"), "expires_in": settings.access_token_minutes * 60})


@app.post("/api/v1/auth/refresh")
def refresh(body: RefreshRequest) -> dict[str, Any]:
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": str(exc)}) from exc
    return ok({"access_token": create_token(payload["sub"], "access"), "expires_in": settings.access_token_minutes * 60})


@app.post("/api/v1/devices")
def create_device(body: DeviceCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    device_id = new_id()
    now = iso_now()
    with get_db() as db:
        db.execute(
            """
            INSERT INTO devices
            (id, user_id, device_name, os_type, os_version, client_version, first_seen_at, last_seen_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, user["id"], body.device_name, body.os_type, body.os_version, body.client_version, now, now, now, now),
        )
    return ok({"device_id": device_id})


@app.get("/api/v1/api-keys/deepseek")
def get_deepseek_api_key(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        row = db.execute(
            "SELECT key_hint, updated_at FROM user_api_keys WHERE user_id=? AND provider='deepseek'",
            (user["id"],),
        ).fetchone()
    return ok({
        "provider": "deepseek",
        "configured": bool(row),
        "key_hint": row["key_hint"] if row else "",
        "updated_at": row["updated_at"] if row else None,
    })


@app.put("/api/v1/api-keys/deepseek")
def save_deepseek_api_key(body: ApiKeyRequest, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "api key required"})
    now = iso_now()
    hint = api_key_hint(api_key)
    with get_db() as db:
        db.execute(
            """
            INSERT INTO user_api_keys (user_id, provider, api_key, key_hint, created_at, updated_at)
            VALUES (?, 'deepseek', ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                api_key=excluded.api_key,
                key_hint=excluded.key_hint,
                updated_at=excluded.updated_at
            """,
            (user["id"], api_key, hint, now, now),
        )
    return ok({"provider": "deepseek", "configured": True, "key_hint": hint, "updated_at": now})


@app.delete("/api/v1/api-keys/deepseek")
def delete_deepseek_api_key(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        db.execute("DELETE FROM user_api_keys WHERE user_id=? AND provider='deepseek'", (user["id"],))
    return ok({"provider": "deepseek", "configured": False})


@app.get("/api/v1/devices")
def list_devices(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        devices = db.execute("SELECT * FROM devices WHERE user_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
    return ok({"devices": devices})


@app.patch("/api/v1/devices/{device_id}")
def update_device(device_id: str, body: DeviceUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if body.status not in {"active", "disabled"}:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "invalid status"})
    with get_db() as db:
        result = db.execute("UPDATE devices SET status=?, updated_at=? WHERE id=? AND user_id=?", (body.status, iso_now(), device_id, user["id"]))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "device not found"})
    return ok()


@app.post("/api/v1/activity-records/batch")
def upload_activity_records(body: ActivityBatch, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        device = db.execute("SELECT * FROM devices WHERE id=? AND user_id=?", (body.device_id, user["id"])).fetchone()
    if not device:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "device not found"})
    if device["status"] != "active":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "device disabled"})

    accepted = duplicated = failed = 0
    results: list[dict[str, Any]] = []
    touched_dates: set[str] = set()
    with get_db() as db:
        for record in body.records:
            raw = record.model_dump() if hasattr(record, "model_dump") else record.dict()
            try:
                validate_no_raw_sensitive_fields(raw)
                if record.category not in CATEGORIES:
                    raise ValueError("invalid category")
                if record.privacy_level not in PRIVACY_LEVELS:
                    raise ValueError("invalid privacy_level")
                existing = db.execute(
                    "SELECT id FROM activity_records WHERE user_id=? AND device_id=? AND client_record_id=?",
                    (user["id"], body.device_id, record.client_record_id),
                ).fetchone()
                if existing:
                    duplicated += 1
                    results.append({"client_record_id": record.client_record_id, "server_record_id": existing["id"], "status": "duplicated"})
                    continue
                record_id = new_id()
                now = iso_now()
                db.execute(
                    """
                    INSERT INTO activity_records
                    (id, user_id, device_id, client_record_id, session_id, start_time, end_time, duration_seconds,
                     app_name, window_title, process_name, summary, category, confidence, privacy_level, metadata,
                     created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record_id, user["id"], body.device_id, record.client_record_id, record.session_id,
                        record.start_time, record.end_time, record.duration_seconds, redact_text(record.app_name),
                        redact_text(record.window_title), redact_text(record.process_name), redact_text(record.summary),
                        record.category, record.confidence, record.privacy_level, json_dumps(record.metadata or {}), now, now,
                    ),
                )
                accepted += 1
                touched_dates.add(date_from_iso(record.start_time))
                results.append({"client_record_id": record.client_record_id, "server_record_id": record_id, "status": "accepted"})
            except Exception as exc:
                failed += 1
                results.append({"client_record_id": record.client_record_id, "status": "failed", "error": str(exc)})
        db.execute("UPDATE devices SET last_seen_at=?, updated_at=? WHERE id=?", (iso_now(), iso_now(), body.device_id))
    for date_text in touched_dates:
        mark_report_stale(user["id"], date_text)
        generate_daily_report(user["id"], date_text, user["timezone"])
    return ok({"accepted": accepted, "duplicated": duplicated, "failed": failed, "results": results})


@app.get("/api/v1/activity-records")
def list_activity_records(date: str | None = None, page: int = 1, page_size: int = 100, category: str | None = None, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    filters = ["user_id=? AND is_deleted=0"]
    params: list[Any] = [user["id"]]
    if date:
        filters.append("substr(start_time, 1, 10)=?")
        params.append(date)
    if category:
        filters.append("category=?")
        params.append(category)
    where = " AND ".join(filters)
    with get_db() as db:
        total = db.execute(f"SELECT COUNT(*) AS count FROM activity_records WHERE {where}", params).fetchone()["count"]
        rows = db.execute(
            f"""
            SELECT id, start_time, end_time, duration_seconds, summary, category, app_name, privacy_level, confidence
            FROM activity_records WHERE {where} ORDER BY start_time ASC LIMIT ? OFFSET ?
            """,
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    return ok({"date": date, "timezone": user["timezone"], "records": rows, "pagination": {"page": page, "page_size": page_size, "total": total}})


@app.patch("/api/v1/activity-records/{record_id}")
def patch_record(record_id: str, body: ActivityPatch, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        old = db.execute("SELECT * FROM activity_records WHERE id=? AND user_id=? AND is_deleted=0", (record_id, user["id"])).fetchone()
        if not old:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "record not found"})
        new_summary = redact_text(body.summary) if body.summary is not None else old["summary"]
        new_category = body.category or old["category"]
        if new_category not in CATEGORIES:
            raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "invalid category"})
        now = iso_now()
        db.execute(
            """
            INSERT INTO activity_record_edits
            (id, activity_record_id, user_id, old_summary, new_summary, old_category, new_category,
             old_start_time, new_start_time, old_end_time, new_end_time, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (new_id(), record_id, user["id"], old["summary"], new_summary, old["category"], new_category, old["start_time"], body.start_time or old["start_time"], old["end_time"], body.end_time or old["end_time"], now),
        )
        db.execute(
            """
            UPDATE activity_records SET summary=?, category=?, start_time=?, end_time=?, app_name=?, updated_at=?
            WHERE id=? AND user_id=?
            """,
            (new_summary, new_category, body.start_time or old["start_time"], body.end_time or old["end_time"], redact_text(body.app_name) if body.app_name is not None else old["app_name"], now, record_id, user["id"]),
        )
    mark_report_stale(user["id"], date_from_iso(body.start_time or old["start_time"]))
    return ok({"id": record_id})


@app.delete("/api/v1/activity-records/{record_id}")
def delete_record(record_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        old = db.execute("SELECT start_time FROM activity_records WHERE id=? AND user_id=? AND is_deleted=0", (record_id, user["id"])).fetchone()
        if not old:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "record not found"})
        db.execute("UPDATE activity_records SET is_deleted=1, deleted_at=?, updated_at=? WHERE id=?", (iso_now(), iso_now(), record_id))
    mark_report_stale(user["id"], date_from_iso(old["start_time"]))
    return ok()


@app.get("/api/v1/daily-reports/{date_text}")
def get_report(date_text: str, include_ai_analysis: bool = False, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    report = get_daily_report(user["id"], date_text, include_ai_analysis=include_ai_analysis)
    if not report or report.get("is_stale"):
        report = generate_daily_report(user["id"], date_text, user["timezone"])
    if include_ai_analysis:
        report = get_daily_report(user["id"], date_text, include_ai_analysis=True)
    return ok(report)


@app.post("/api/v1/daily-reports/{date_text}/regenerate")
def regenerate_report(date_text: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    generate_daily_report(user["id"], date_text, user["timezone"])
    return ok({"status": "generated"})


@app.patch("/api/v1/daily-reports/{date_text}")
def patch_report(date_text: str, body: ReportPatch, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    get_daily_report(user["id"], date_text) or generate_daily_report(user["id"], date_text, user["timezone"])
    with get_db() as db:
        db.execute("UPDATE daily_reports SET user_note=?, is_stale=1, updated_at=? WHERE user_id=? AND report_date=?", (redact_text(body.user_note), iso_now(), user["id"], date_text))
    return ok()


@app.get("/api/v1/daily-reports/{date_text}/export")
def export_report(date_text: str, format: str = Query("markdown"), user: dict[str, Any] = Depends(current_user)) -> Response:
    report = get_daily_report(user["id"], date_text, include_ai_analysis=True) or generate_daily_report(user["id"], date_text, user["timezone"])
    if format == "json":
        return Response(json_dumps(report), media_type="application/json")
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=["start_time", "end_time", "duration_seconds", "category", "app_name", "summary"])
        writer.writeheader()
        for item in report["timeline"]:
            writer.writerow({key: item.get(key, "") for key in writer.fieldnames})
        return Response(buffer.getvalue(), media_type="text/csv")
    if format != "markdown":
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "unsupported export format"})
    return PlainTextResponse(format_markdown_report(report), media_type="text/markdown")


@app.post("/api/v1/daily-reports/{date_text}/ai-analysis")
def create_ai_analysis(date_text: str, body: AiAnalysisRequest, background: BackgroundTasks, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if body.analysis_type != "daily":
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "only daily is supported in MVP"})
    model = body.model or (settings.deepseek_deep_model if body.mode == "deep" else settings.deepseek_default_model)
    allowed_models = {settings.deepseek_default_model, settings.deepseek_deep_model, "deepseek-v4-flash", "deepseek-v4-pro"}
    if model not in allowed_models:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PARAMS", "message": "model not allowed"})
    if not get_user_api_key(user["id"]):
        raise HTTPException(status_code=400, detail={"code": "API_KEY_REQUIRED", "message": "\u8bf7\u5148\u5728 API \u7ba1\u7406\u4e2d\u914d\u7f6e DeepSeek API Key"})
    payload = build_ai_payload(user["id"], date_text)
    input_hash = stable_hash(payload)
    with get_db() as db:
        report = db.execute("SELECT id FROM daily_reports WHERE user_id=? AND report_date=?", (user["id"], date_text)).fetchone()
        if not body.force_regenerate:
            cached = db.execute(
                """
                SELECT id, status FROM ai_analysis_jobs
                WHERE user_id=? AND analysis_type='daily' AND input_hash=? AND status IN ('succeeded','fallback')
                ORDER BY finished_at DESC LIMIT 1
                """,
                (user["id"], input_hash),
            ).fetchone()
            if cached:
                return ok({"job_id": cached["id"], "status": cached["status"], "cached": True})
        job_id = new_id()
        now = iso_now()
        db.execute(
            """
            INSERT INTO ai_analysis_jobs
            (id, user_id, report_id, analysis_type, report_date, status, mode, model_name, input_hash,
             prompt_version, sanitized_payload, created_at, updated_at)
            VALUES (?, ?, ?, 'daily', ?, 'pending', ?, ?, ?, 'daily-v1', ?, ?, ?)
            """,
            (job_id, user["id"], report["id"] if report else None, date_text, body.mode, model, input_hash, json_dumps(payload), now, now),
        )
        db.execute("UPDATE daily_reports SET ai_analysis_status='pending', ai_analysis_job_id=?, updated_at=? WHERE user_id=? AND report_date=?", (job_id, now, user["id"], date_text))
    background.add_task(run_ai_job, job_id)
    return ok({"job_id": job_id, "status": "pending", "cached": False})


@app.get("/api/v1/ai-analysis-jobs/{job_id}")
def get_ai_job(job_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with get_db() as db:
        job = db.execute("SELECT * FROM ai_analysis_jobs WHERE id=? AND user_id=?", (job_id, user["id"])).fetchone()
    if not job:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "job not found"})
    return ok({"job_id": job["id"], "status": job["status"], "model_provider": job["model_provider"], "model_name": job["model_name"], "analysis_result": json_loads(job["analysis_result"], None), "error_code": job["error_code"], "error_message": job["error_message"], "created_at": job["created_at"], "finished_at": job["finished_at"]})


static_dir = ROOT_DIR / "web"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", response_class=HTMLResponse)
@app.get("/home", response_class=HTMLResponse)
@app.get("/records", response_class=HTMLResponse)
@app.get("/api-keys", response_class=HTMLResponse)
def index() -> FileResponse:
    return FileResponse(static_dir / "index.html")
