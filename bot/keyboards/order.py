from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from bot.config import config


def webapp_keyboard(text: str = "🛒 Buyurtma berish") -> InlineKeyboardMarkup | None:
    """Mini App'ni ochadigan tugma. WEBAPP_URL sozlanmagan bo'lsa None qaytaradi
    (Telegram faqat HTTPS manzilli web_app tugmasini qabul qiladi)."""
    if not config.webapp_ready:
        return None

    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=text, web_app=WebAppInfo(url=config.webapp_url))]]
    )
