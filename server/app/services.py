from __future__ import annotations

import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

import httpx

from .config import settings
from .database import get_db
from .security import iso_now, stable_hash


CATEGORIES = {
    "编程开发",
    "文档写作",
    "论文阅读",
    "数据分析",
    "模型训练",
    "会议沟通",
    "信息检索",
    "娱乐休息",
    "系统操作",
    "空闲",
    "隐私",
    "其他",
}
PRIVACY_LEVELS = {"normal", "private", "redacted"}
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


SENSITIVE_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S+"),
    re.compile(r"\b\d{15,18}\b"),
    re.compile(r"\b\d{13,19}\b"),
    re.compile(r"\b1[3-9]\d{9}\b"),
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
]


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def new_id() -> str:
    return str(uuid.uuid4())


def redact_text(text: str | None) -> str | None:
    if text is None:
        return None
    redacted = text
    for pattern in SENSITIVE_PATTERNS:
        redacted = pattern.sub("[已脱敏]", redacted)
    return redacted[:600]


def validate_no_raw_sensitive_fields(record: dict[str, Any]) -> None:
    forbidden = {"raw_screenshot", "image_base64", "ocr_text", "keyboard_input", "mouse_trace", "audio", "camera"}
    found = forbidden.intersection(record)
    if found:
        raise ValueError(f"禁止上传隐私原始字段: {', '.join(sorted(found))}")


def mark_report_stale(user_id: str, date_text: str) -> None:
    now = iso_now()
    with get_db() as db:
        db.execute(
            """
            UPDATE daily_reports
            SET is_stale = 1,
                ai_analysis_status = CASE WHEN ai_analysis_status = 'none' THEN 'none' ELSE 'stale' END,
                updated_at = ?
            WHERE user_id = ? AND report_date = ?
            """,
            (now, user_id, date_text),
        )


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def date_from_iso(value: str) -> str:
    try:
        return parse_dt(value).astimezone(SHANGHAI_TZ).date().isoformat()
    except Exception:
        return value[:10]


def time_hhmm(value: str) -> str:
    try:
        return parse_dt(value).astimezone(SHANGHAI_TZ).strftime("%H:%M")
    except Exception:
        return value[11:16]


def list_records_for_date(user_id: str, date_text: str) -> list[dict[str, Any]]:
    with get_db() as db:
        rows = db.execute(
            """
            SELECT * FROM activity_records
            WHERE user_id = ? AND is_deleted = 0
            ORDER BY start_time ASC
            """,
            (user_id,),
        ).fetchall()
    return [row for row in rows if date_from_iso(row["start_time"]) == date_text]



SUMMARY_SEPARATOR = "\uFF1B"
MAX_SUMMARY_PARTS_PER_TIMELINE_ITEM = 2
SUMMARY_PUNCT_RE = re.compile(r'''[\s,\uFF0C\u3002.!\uFF01?\uFF1F:\uFF1A;\uFF1B\u3001()\uFF08\uFF09\[\]\u3010\u3011"'\u201C\u201D\u2018\u2019\u300A\u300B<>]+''')
SUMMARY_FILLER_PHRASES = (
    "\u7528\u6237\u6B63\u5728",
    "\u7528\u6237\u5728",
    "\u6B63\u5728",
    "\u5F53\u524D\u5904\u4E8E",
    "\u9875\u9762\u663E\u793A",
    "\u6D4F\u89C8\u72B6\u6001",
    "\u67E5\u770B\u4E86",
    "\u67E5\u770B",
    "\u6D4F\u89C8",
)


def split_summary_parts(summary: str | None) -> list[str]:
    if not summary:
        return []
    return [part.strip() for part in re.split(r"[\uFF1B;]", summary) if part.strip()]


def normalize_summary_text(summary: str | None) -> str:
    text = SUMMARY_PUNCT_RE.sub("", (summary or "").lower())
    for phrase in SUMMARY_FILLER_PHRASES:
        text = text.replace(phrase, "")
    return text


def summary_ngrams(value: str, size: int = 2) -> set[str]:
    if len(value) <= size:
        return {value} if value else set()
    return {value[index : index + size] for index in range(len(value) - size + 1)}


def summary_similarity(left: str | None, right: str | None) -> float:
    left_norm = normalize_summary_text(left)
    right_norm = normalize_summary_text(right)
    if not left_norm or not right_norm:
        return 0.0
    shorter, longer = sorted((left_norm, right_norm), key=len)
    if len(shorter) >= 8 and shorter in longer:
        return 1.0
    left_grams = summary_ngrams(left_norm)
    right_grams = summary_ngrams(right_norm)
    if not left_grams or not right_grams:
        return 0.0
    return 2 * len(left_grams & right_grams) / (len(left_grams) + len(right_grams))


def summary_score(summary: str) -> float:
    normalized = normalize_summary_text(summary)
    return len(summary_ngrams(normalized)) + min(len(normalized), 120) * 0.15


def choose_better_summary(existing: str, incoming: str) -> str:
    return incoming if summary_score(incoming) > summary_score(existing) else existing


def append_unique_summary(existing: str, incoming: str | None) -> str:
    incoming = (incoming or "").strip()
    if not incoming:
        return existing
    parts = split_summary_parts(existing)
    if not parts:
        return incoming
    for index, part in enumerate(parts):
        if summary_similarity(part, incoming) >= 0.42:
            parts[index] = choose_better_summary(part, incoming)
            return SUMMARY_SEPARATOR.join(parts[:MAX_SUMMARY_PARTS_PER_TIMELINE_ITEM])
    if len(parts) < MAX_SUMMARY_PARTS_PER_TIMELINE_ITEM:
        parts.append(incoming)
    return SUMMARY_SEPARATOR.join(parts[:MAX_SUMMARY_PARTS_PER_TIMELINE_ITEM])

def merge_timeline(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    for row in records:
        item = {
            "start_time": time_hhmm(row["start_time"]),
            "end_time": time_hhmm(row["end_time"]),
            "start_iso": row["start_time"],
            "end_iso": row["end_time"],
            "duration_seconds": int(row["duration_seconds"]),
            "summary": row["summary"],
            "category": row["category"],
            "app_name": row["app_name"],
            "privacy_level": row["privacy_level"],
            "source_record_ids": [row["id"]],
        }
        if not timeline:
            timeline.append(item)
            continue
        prev = timeline[-1]
        try:
            gap = (parse_dt(row["start_time"]) - parse_dt(prev["end_iso"])).total_seconds()
        except Exception:
            gap = 9999
        can_merge = (
            gap <= 90
            and prev["category"] == item["category"]
            and (prev.get("app_name") or "") == (item.get("app_name") or "")
            and prev.get("privacy_level") == item.get("privacy_level")
        )
        if can_merge:
            prev["end_time"] = item["end_time"]
            prev["end_iso"] = item["end_iso"]
            prev["duration_seconds"] += item["duration_seconds"]
            prev["source_record_ids"].extend(item["source_record_ids"])
            prev["summary"] = append_unique_summary(prev["summary"], item["summary"])
        else:
            timeline.append(item)
    for item in timeline:
        item.pop("start_iso", None)
        item.pop("end_iso", None)
    return timeline


def summarize_report(date_text: str, timeline: list[dict[str, Any]], category_stats: list[dict[str, Any]]) -> tuple[str, str, list[str]]:
    if not timeline:
        return f"{date_text} 暂无活动记录", "今天还没有可生成日报的活动记录。", []
    top_categories = [c["category"] for c in category_stats[:2]]
    title = f"{date_text} 主要进行了{'、'.join(top_categories)}"
    highlights = [item["summary"] for item in sorted(timeline, key=lambda x: x["duration_seconds"], reverse=True)[:5]]
    overview = f"共记录 {len(timeline)} 个活动片段，主要时间投入在{'、'.join(top_categories)}。"
    return title, overview, highlights


def generate_daily_report(user_id: str, date_text: str, timezone_name: str = "Asia/Shanghai") -> dict[str, Any]:
    records = list_records_for_date(user_id, date_text)
    timeline = merge_timeline(records)
    category_seconds: defaultdict[str, int] = defaultdict(int)
    app_seconds: defaultdict[str, int] = defaultdict(int)
    total = active = idle = private = 0
    for row in records:
        seconds = int(row["duration_seconds"])
        total += seconds
        if row["category"] == "空闲":
            idle += seconds
        elif row["privacy_level"] == "private" or row["category"] == "隐私":
            private += seconds
        else:
            active += seconds
        category_seconds[row["category"]] += seconds
        if row["app_name"]:
            app_seconds[row["app_name"]] += seconds

    category_stats = [
        {"category": cat, "duration_seconds": seconds, "percentage": round(seconds * 100 / total, 1) if total else 0}
        for cat, seconds in sorted(category_seconds.items(), key=lambda item: item[1], reverse=True)
    ]
    app_stats = [
        {"app_name": app, "duration_seconds": seconds, "percentage": round(seconds * 100 / total, 1) if total else 0}
        for app, seconds in sorted(app_seconds.items(), key=lambda item: item[1], reverse=True)
    ]
    title, overview, highlights = summarize_report(date_text, timeline, category_stats)
    now = iso_now()
    report_id = new_id()
    with get_db() as db:
        existing = db.execute(
            "SELECT id, user_note FROM daily_reports WHERE user_id = ? AND report_date = ?",
            (user_id, date_text),
        ).fetchone()
        if existing:
            report_id = existing["id"]
            user_note = existing.get("user_note")
            db.execute(
                """
                UPDATE daily_reports
                SET timezone=?, title=?, overview=?, highlights=?, timeline=?, category_stats=?, app_stats=?,
                    total_tracked_seconds=?, active_seconds=?, idle_seconds=?, private_seconds=?,
                    status='generated', is_stale=0, generated_at=?, updated_at=?
                WHERE id=?
                """,
                (
                    timezone_name,
                    title,
                    overview,
                    json_dumps(highlights),
                    json_dumps(timeline),
                    json_dumps(category_stats),
                    json_dumps(app_stats),
                    total,
                    active,
                    idle,
                    private,
                    now,
                    now,
                    report_id,
                ),
            )
        else:
            user_note = ""
            db.execute(
                """
                INSERT INTO daily_reports (
                    id, user_id, report_date, timezone, title, overview, highlights, timeline,
                    category_stats, app_stats, suggestions, user_note, total_tracked_seconds,
                    active_seconds, idle_seconds, private_seconds, status, is_stale,
                    generated_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', 0, ?, ?, ?)
                """,
                (
                    report_id,
                    user_id,
                    date_text,
                    timezone_name,
                    title,
                    overview,
                    json_dumps(highlights),
                    json_dumps(timeline),
                    json_dumps(category_stats),
                    json_dumps(app_stats),
                    "保持较长连续活动片段，减少不必要的上下文切换。",
                    user_note,
                    total,
                    active,
                    idle,
                    private,
                    now,
                    now,
                    now,
                ),
            )
    return get_daily_report(user_id, date_text, include_ai_analysis=True) or {}


def get_daily_report(user_id: str, date_text: str, include_ai_analysis: bool = False) -> dict[str, Any] | None:
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?",
            (user_id, date_text),
        ).fetchone()
    if not row:
        return None
    result = {
        "date": row["report_date"],
        "timezone": row["timezone"],
        "title": row["title"],
        "overview": row["overview"],
        "total_tracked_seconds": row["total_tracked_seconds"],
        "active_seconds": row["active_seconds"],
        "idle_seconds": row["idle_seconds"],
        "private_seconds": row["private_seconds"],
        "is_stale": bool(row["is_stale"]),
        "highlights": json_loads(row["highlights"], []),
        "timeline": json_loads(row["timeline"], []),
        "category_stats": json_loads(row["category_stats"], []),
        "app_stats": json_loads(row["app_stats"], []),
        "user_note": row["user_note"] or "",
    }
    if include_ai_analysis:
        result["ai_analysis"] = {
            "status": row["ai_analysis_status"],
            "job_id": row["ai_analysis_job_id"],
            "model_provider": "deepseek" if row["ai_model_name"] else None,
            "model_name": row["ai_model_name"],
            "title": row["ai_title"],
            "one_sentence_summary": row["ai_summary"],
            "highlights": json_loads(row["ai_highlights"], []),
            "timeline_commentary": json_loads(row["ai_timeline_commentary"], []),
            "focus_analysis": json_loads(row["ai_focus_analysis"], {}),
            "suggestions": json_loads(row["ai_suggestions"], []),
            "risk_flags": json_loads(row["ai_risk_flags"], []),
            "generated_at": row["ai_generated_at"],
        }
    return result


def build_ai_payload(user_id: str, date_text: str) -> dict[str, Any]:
    report = get_daily_report(user_id, date_text) or generate_daily_report(user_id, date_text)
    payload = {
        "date": date_text,
        "timezone": report["timezone"],
        "overview_stats": {
            "total_tracked_seconds": report["total_tracked_seconds"],
            "active_seconds": report["active_seconds"],
            "idle_seconds": report["idle_seconds"],
            "private_seconds": report["private_seconds"],
        },
        "category_stats": report["category_stats"],
        "app_stats": report["app_stats"],
        "timeline": [
            {
                "start_time": item.get("start_time"),
                "end_time": item.get("end_time"),
                "duration_seconds": item.get("duration_seconds"),
                "category": item.get("category"),
                "summary": redact_text(item.get("summary")),
                "app_name": redact_text(item.get("app_name")),
            }
            for item in report["timeline"][:1000]
        ],
        "user_note": redact_text(report.get("user_note")),
    }
    validate_ai_payload(payload)
    return payload


def validate_ai_payload(payload: dict[str, Any]) -> None:
    raw = json_dumps(payload)
    forbidden_terms = ["image_base64", "raw_screenshot", "ocr_text", "keyboard_input", "mouse_trace", "camera", "audio"]
    if any(term in raw for term in forbidden_terms):
        raise ValueError("AI 分析输入包含禁止字段")
    if re.search(r"data:image/|[A-Za-z0-9+/]{800,}={0,2}", raw):
        raise ValueError("AI 分析输入疑似包含图片或大段原文")


def fallback_ai_result(payload: dict[str, Any]) -> dict[str, Any]:
    category = payload["category_stats"][0]["category"] if payload.get("category_stats") else "活动记录"
    highlights = [item["summary"] for item in payload.get("timeline", [])[:5] if item.get("summary")]
    return {
        "title": f"{payload['date']} 主要投入在{category}",
        "one_sentence_summary": f"今天的主要活动集中在{category}，以下结果由规则日报降级生成。",
        "highlights": highlights,
        "timeline_commentary": [
            {"time_range": f"{item['start_time']}-{item['end_time']}", "commentary": item["summary"]}
            for item in payload.get("timeline", [])[:8]
        ],
        "focus_analysis": {
            "focused_blocks": [
                f"{item['start_time']}-{item['end_time']}"
                for item in payload.get("timeline", [])
                if int(item.get("duration_seconds") or 0) >= 3600 and item.get("category") not in {"空闲", "隐私"}
            ],
            "context_switching_notes": "未启用或未成功调用 DeepSeek，暂以规则统计展示。",
        },
        "suggestions": ["保持可复用的连续工作时段；需要更细分析时可配置 DeepSeek API Key 后重新分析。"],
        "risk_flags": [],
    }


def normalize_ai_result(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": value.get("title") or value.get("overview") or "AI 日报分析",
        "one_sentence_summary": value.get("one_sentence_summary") or value.get("overview") or "",
        "highlights": value.get("highlights") or [],
        "timeline_commentary": value.get("timeline_commentary") or [],
        "focus_analysis": value.get("focus_analysis") or {},
        "suggestions": value.get("suggestions") or [],
        "risk_flags": value.get("risk_flags") or [],
    }


def extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise



def get_user_api_key(user_id: str, provider: str = "deepseek") -> str:
    with get_db() as db:
        row = db.execute(
            "SELECT api_key FROM user_api_keys WHERE user_id=? AND provider=?",
            (user_id, provider),
        ).fetchone()
    return (row["api_key"] if row else "") or ""

def call_deepseek(payload: dict[str, Any], model_name: str, api_key: str | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    effective_api_key = (api_key or "").strip()
    if not effective_api_key:
        raise RuntimeError("请先在 API 管理中配置 DeepSeek API Key")
    system_prompt = (
        "你是一个个人时间复盘助手。基于事实记录生成客观日报分析。不要编造、不要心理诊断、"
        "不要输出敏感原文，不要猜测隐私时间。只输出严格 JSON。"
    )
    schema_prompt = {
        "title": "...",
        "one_sentence_summary": "...",
        "highlights": ["..."],
        "timeline_commentary": [{"time_range": "...", "commentary": "..."}],
        "focus_analysis": {"focused_blocks": ["..."], "context_switching_notes": "..."},
        "suggestions": ["..."],
        "risk_flags": ["..."],
    }
    request_body = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": "请按此 JSON 结构输出：\n"
                + json_dumps(schema_prompt)
                + "\n活动记录：\n"
                + json_dumps(payload),
            },
        ],
        "stream": False,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    last_error: Exception | None = None
    for _ in range(settings.deepseek_max_retries + 1):
        try:
            with httpx.Client(timeout=settings.deepseek_timeout_seconds) as client:
                resp = client.post(
                    f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {effective_api_key}"},
                    json=request_body,
                )
                resp.raise_for_status()
                data = resp.json()
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage") or {}
            return normalize_ai_result(extract_json_object(content)), {
                "input_tokens": int(usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("completion_tokens") or 0),
                "total_tokens": int(usage.get("total_tokens") or 0),
            }
        except Exception as exc:
            last_error = exc
    raise RuntimeError(str(last_error))


def run_ai_job(job_id: str) -> None:
    now = iso_now()
    with get_db() as db:
        job = db.execute("SELECT * FROM ai_analysis_jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return
        db.execute("UPDATE ai_analysis_jobs SET status='running', started_at=?, updated_at=? WHERE id=?", (now, now, job_id))
    payload = json_loads(job["sanitized_payload"], {})
    status = "succeeded"
    error_code = None
    error_message = None
    usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    try:
        result, usage = call_deepseek(payload, job["model_name"], get_user_api_key(job["user_id"]))
    except Exception as exc:
        status = "fallback"
        error_code = "DEEPSEEK_UNAVAILABLE"
        error_message = str(exc)
        result = fallback_ai_result(payload)

    finished = iso_now()
    with get_db() as db:
        db.execute(
            """
            UPDATE ai_analysis_jobs
            SET status=?, analysis_result=?, input_tokens=?, output_tokens=?, total_tokens=?,
                error_code=?, error_message=?, finished_at=?, updated_at=?
            WHERE id=?
            """,
            (
                status,
                json_dumps(result),
                usage["input_tokens"],
                usage["output_tokens"],
                usage["total_tokens"],
                error_code,
                error_message,
                finished,
                finished,
                job_id,
            ),
        )
        db.execute(
            """
            UPDATE daily_reports
            SET ai_analysis_status=?, ai_analysis_job_id=?, ai_title=?, ai_summary=?, ai_highlights=?,
                ai_timeline_commentary=?, ai_focus_analysis=?, ai_suggestions=?, ai_risk_flags=?,
                ai_model_name=?, ai_generated_at=?, updated_at=?
            WHERE user_id=? AND report_date=?
            """,
            (
                status,
                job_id,
                result["title"],
                result["one_sentence_summary"],
                json_dumps(result["highlights"]),
                json_dumps(result["timeline_commentary"]),
                json_dumps(result["focus_analysis"]),
                json_dumps(result["suggestions"]),
                json_dumps(result["risk_flags"]),
                job["model_name"],
                finished,
                finished,
                job["user_id"],
                job["report_date"],
            ),
        )
        if usage["total_tokens"]:
            db.execute(
                """
                INSERT INTO ai_analysis_token_usage
                (id, user_id, job_id, usage_date, model_provider, model_name, input_tokens, output_tokens, total_tokens, created_at)
                VALUES (?, ?, ?, ?, 'deepseek', ?, ?, ?, ?, ?)
                """,
                (
                    new_id(),
                    job["user_id"],
                    job_id,
                    job["report_date"],
                    job["model_name"],
                    usage["input_tokens"],
                    usage["output_tokens"],
                    usage["total_tokens"],
                    finished,
                ),
            )


def format_markdown_report(report: dict[str, Any]) -> str:
    lines = [f"# {report['title']}", "", report["overview"], ""]
    lines.append("## 统计")
    lines.append(f"- 总记录：{report['total_tracked_seconds']} 秒")
    lines.append(f"- 有效活动：{report['active_seconds']} 秒")
    lines.append(f"- 空闲：{report['idle_seconds']} 秒")
    lines.append(f"- 隐私：{report['private_seconds']} 秒")
    lines.append("")
    lines.append("## 时间线")
    for item in report["timeline"]:
        lines.append(f"- {item['start_time']}-{item['end_time']} [{item['category']}] {item['summary']}")
    if report.get("ai_analysis", {}).get("one_sentence_summary"):
        lines.append("")
        lines.append("## AI 分析")
        lines.append(report["ai_analysis"]["one_sentence_summary"])
        for suggestion in report["ai_analysis"].get("suggestions", []):
            lines.append(f"- {suggestion}")
    return "\n".join(lines) + "\n"
