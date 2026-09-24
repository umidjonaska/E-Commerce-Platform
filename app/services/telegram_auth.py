"""Telegram Mini App `initData` ni tekshirish.

Spetsifikatsiya: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import HTTPException, status

from app.core.config import config


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None

    @property
    def full_name(self) -> str:
        return " ".join(part for part in (self.first_name, self.last_name) if part).strip()


def _unauthorized(detail: str = "Telegram ma'lumoti yaroqsiz") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def validate_init_data(init_data: str, bot_token: str | None = None, max_age: int | None = None) -> TelegramUser:
    token = bot_token if bot_token is not None else config.telegram.bot_token
    max_age = max_age if max_age is not None else config.telegram.init_data_max_age

    if not token:
        # Sozlanmagan server: initData ni tekshirib bo'lmaydi, shuning uchun hech kimni kiritmaymiz
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Telegram integratsiyasi sozlanmagan")

    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        raise _unauthorized()

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise _unauthorized()

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise _unauthorized()

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError:
        raise _unauthorized()

    if auth_date <= 0 or time.time() - auth_date > max_age:
        raise _unauthorized("Telegram sessiyasi eskirgan, ilovani qayta oching")

    try:
        user = json.loads(pairs["user"])
        return TelegramUser(
            id=int(user["id"]),
            first_name=str(user.get("first_name") or ""),
            last_name=user.get("last_name"),
            username=user.get("username"),
        )
    except (KeyError, ValueError, TypeError):
        raise _unauthorized()


def build_init_data(user: dict, bot_token: str, auth_date: int | None = None, **extra: str) -> str:
    """Test va lokal ishlab chiqish uchun: to'g'ri imzolangan initData yaratadi."""
    from urllib.parse import urlencode

    fields = {"auth_date": str(auth_date or int(time.time())), "user": json.dumps(user, separators=(",", ":")), **extra}
    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)
