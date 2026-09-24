"""Vaqt zonasi bilan ishlash: "bugun", "shu hafta", "shu oy" kabi chegaralar
`APP_TIMEZONE` (default Asia/Tashkent) bo'yicha hisoblanadi, DB'da esa UTC saqlanadi."""
import re
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from app.core.config import config

# Tashkent DST ishlatmaydi (UTC+5), tzdata bo'lmagan muhit uchun zaxira
_FALLBACK_TZ = timezone(timedelta(hours=5), name="Asia/Tashkent")

MAX_RANGE_DAYS = 366


def _load_tz():
    try:
        return ZoneInfo(config.app.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return _FALLBACK_TZ


TZ = _load_tz()

# SQL ichida literal sifatida ishlatiladi, shuning uchun qat'iy tekshiriladi
TZ_NAME = config.app.timezone if re.fullmatch(r"[A-Za-z0-9_+\-/]+", config.app.timezone) else "Asia/Tashkent"


class Period(str, Enum):
    today = "today"
    week = "week"
    month = "month"
    custom = "custom"


def local_today() -> date:
    return datetime.now(TZ).date()


def to_utc_start(day: date) -> datetime:
    """Mahalliy kun boshlanishi (00:00) UTC'da."""
    return datetime.combine(day, time.min, tzinfo=TZ).astimezone(timezone.utc)


def range_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """[date_from 00:00, date_to+1 kun 00:00) oralig'i UTC'da."""
    return to_utc_start(date_from), to_utc_start(date_to + timedelta(days=1))


def resolve_period(
    period: Period,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[date, date]:
    today = local_today()

    if period == Period.today:
        return today, today
    if period == Period.week:
        return today - timedelta(days=today.weekday()), today
    if period == Period.month:
        return today.replace(day=1), today

    # custom
    if date_from is None or date_to is None:
        raise HTTPException(status_code=422, detail="Oraliq uchun boshlanish va tugash sanasi kerak")
    if date_from > date_to:
        raise HTTPException(status_code=422, detail="Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas")
    if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"Oraliq {MAX_RANGE_DAYS} kundan oshmasligi kerak")
    return date_from, date_to
