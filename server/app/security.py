from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import settings


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2_sha256${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split("$", 2)
        if scheme != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode())
        expected = base64.urlsafe_b64decode(digest_b64.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def create_token(user_id: str, token_type: str = "access") -> str:
    if token_type == "refresh":
        exp = utc_now() + timedelta(days=settings.refresh_token_days)
    else:
        exp = utc_now() + timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": user_id,
        "typ": token_type,
        "iat": int(time.time()),
        "exp": int(exp.timestamp()),
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(settings.token_secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64(sig)}"


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        body, sig = token.split(".", 1)
        expected_sig = hmac.new(settings.token_secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_unb64(sig), expected_sig):
            raise ValueError("bad signature")
        payload = json.loads(_unb64(body).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid token") from exc
    if payload.get("typ") != expected_type:
        raise ValueError("wrong token type")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired token")
    return payload


def stable_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
