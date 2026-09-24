"""Server xatoliklari haqida administratorlarga Telegram orqali xabar berish.

Ilgari bu vazifani Slack bajarardi. Telegram afzal, chunki bot allaqachon
mavjud: qo'shimcha tashqi servis ham, bloklovchi `requests` kutubxonasi ham
kerak emas - `notify` modulidagi async `httpx` yetarli.
"""
import logging
import time
import traceback
from html import escape

from app.core.config import config
from app.services.notify import send_telegram_message

logger = logging.getLogger(__name__)

# Telegram xabar chegarasi 4096 belgi; traceback uchun shundan kamrog'ini olamiz
MAX_TRACEBACK_CHARS = 2500
TRACEBACK_LINES = 8

# Bir xil xatolik takrorlanaversa, adminni xabar bilan ko'mib tashlamaslik uchun.
# Kesh jarayon ichida saqlanadi: bir nechta worker ishlasa, har biri alohida hisoblaydi.
_last_sent: dict[tuple[str, str], float] = {}
_MAX_TRACKED = 500


def _should_send(key: tuple[str, str], now: float) -> bool:
    window = config.telegram.alert_throttle_seconds
    last = _last_sent.get(key)
    if last is not None and now - last < window:
        return False

    _last_sent[key] = now

    # Kesh cheksiz o'smasligi uchun eskirgan yozuvlarni tozalaymiz
    if len(_last_sent) > _MAX_TRACKED:
        for tracked_key, sent_at in list(_last_sent.items()):
            if now - sent_at >= window:
                del _last_sent[tracked_key]

    return True


def build_message(exc: BaseException, method: str, path: str) -> str:
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)[-TRACEBACK_LINES:])
    tb = tb[-MAX_TRACEBACK_CHARS:]

    return (
        f"🔴 <b>{escape(config.app.app_name)} — server xatosi</b>\n\n"
        f"<b>{escape(type(exc).__name__)}</b>: {escape(str(exc)[:300])}\n"
        f"<code>{escape(method)} {escape(path)}</code>\n\n"
        f"<pre>{escape(tb)}</pre>"
    )


async def send_error_alert(exc: BaseException, method: str, path: str) -> None:
    """Javob yuborilgandan keyin fon vazifasi sifatida chaqiriladi.

    Xabar yuborib bo'lmasa ham hech narsa buzilmaydi: xatolik allaqachon
    logga yozilgan bo'ladi.
    """
    chat_ids = config.telegram.alert_chat_ids
    if not chat_ids:
        return

    if not _should_send((type(exc).__name__, path), time.monotonic()):
        logger.debug("Xatolik xabari cheklov tufayli yuborilmadi: %s %s", type(exc).__name__, path)
        return

    message = build_message(exc, method, path)
    for chat_id in chat_ids:
        await send_telegram_message(chat_id, message)
