"""Telegram bildirishnomalari (Bot API orqali). Xatolar asosiy so'rovga ta'sir qilmaydi."""
import logging
from html import escape

import httpx

from app.core.config import config

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


def _money(value: int) -> str:
    return f"{value:,}".replace(",", " ") + " so'm"


async def send_telegram_message(chat_id: int | None, text: str) -> None:
    """Background task sifatida ishlatiladi. Token yo'q, o'chirilgan yoki chat_id yo'q bo'lsa - hech narsa qilmaydi."""
    token = config.telegram.bot_token
    if not chat_id or not token or not config.telegram.notify_enabled:
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{TELEGRAM_API}/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            )
            if response.status_code != 200:
                logger.warning("Telegram xabar yuborilmadi: chat=%s status=%s", chat_id, response.status_code)
    except httpx.HTTPError:
        logger.warning("Telegram'ga ulanib bo'lmadi: chat=%s", chat_id, exc_info=True)


def _lines(order) -> str:
    return "\n".join(
        f"• {escape(i.product_name)} — {i.quantity} {escape(i.unit)} × {_money(i.unit_price)}" for i in order.items
    )


def _shop(order) -> str:
    name = order.shop.name if order.shop else (order.customer_name or "—")
    return escape(name)


def new_order_for_diller(order) -> str:
    return (
        f"🆕 <b>Yangi buyurtma #{order.id}</b>\n"
        f"🏪 {_shop(order)}\n"
        f"📱 {escape(order.customer_phone or '—')}\n"
        f"📍 {escape(order.delivery_address or '—')}\n\n"
        f"{_lines(order)}\n\n"
        f"💰 Jami: <b>{_money(order.total_amount)}</b>"
    )


def updated_order_for_diller(order) -> str:
    return (
        f"✏️ <b>Buyurtma #{order.id} o'zgartirildi</b>\n"
        f"🏪 {_shop(order)}\n\n"
        f"{_lines(order)}\n\n"
        f"💰 Jami: <b>{_money(order.total_amount)}</b>"
    )


def cancelled_by_client_for_diller(order) -> str:
    return f"❌ <b>Buyurtma #{order.id}</b> mijoz tomonidan bekor qilindi.\n🏪 {_shop(order)}"


_STATUS_TEXT = {
    "confirmed": "✅ Buyurtmangiz #{id} qabul qilindi. Tez orada yetkazib beramiz.",
    "delivered": "📦 Buyurtmangiz #{id} yetkazib berildi. Rahmat!",
    "cancelled": "❌ Buyurtmangiz #{id} bekor qilindi.",
}


def status_for_client(order) -> str:
    text = _STATUS_TEXT[order.status.value].format(id=order.id)
    if order.status.value == "cancelled" and order.reject_reason:
        text += f"\nSabab: {escape(order.reject_reason)}"
    return text


def reassigned_for_client(diller_name: str) -> str:
    return f"ℹ️ Sizning dilleringiz o'zgardi. Yangi diller: <b>{escape(diller_name)}</b>"
