"""Bot, dispatcher va boshlang'ich sozlash.

Ikki rejim shu moduldan foydalanadi:
- polling: `python -m bot.main` (lokal ishlab chiqish, alohida worker)
- webhook: backend ichida (`app/services/telegram_webhook.py`), Render kabi
  hostinglarda alohida doimiy jarayon talab qilmaydi.
"""
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from bot.config import config
from bot.handlers import start

logger = logging.getLogger(__name__)

COMMANDS = [
    BotCommand(command="start", description="Ilovani ochish"),
    BotCommand(command="help", description="Yordam"),
]


def create_bot(token: str) -> Bot:
    return Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))


def create_dispatcher() -> Dispatcher:
    # Router faqat bitta dispatcher'ga ulanadi, shuning uchun bu funksiya
    # har jarayonda bir marta chaqiriladi.
    dp = Dispatcher()
    dp.include_router(start.router)
    return dp


async def setup(bot: Bot) -> None:
    await bot.set_my_commands(COMMANDS)

    if config.webapp_ready:
        # Chat yonidagi menyu tugmasi ham Mini App'ni ochadi
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Buyurtma", web_app=WebAppInfo(url=config.webapp_url))
        )
    else:
        # Telegram web_app tugmasi uchun HTTPS majburiy: http:// va localhost qabul qilinmaydi.
        reason = "bo'sh" if not config.webapp_url else f"HTTPS emas ({config.webapp_url})"
        logger.warning(
            "Mini App tugmasi ko'rsatilmaydi, chunki WEBAPP_URL %s. "
            "Frontendni HTTPS domenga joylashtiring yoki lokal sinov uchun tunnel oching "
            "(masalan: cloudflared tunnel --url http://localhost:5173), so'ng .env dagi "
            "WEBAPP_URL ga o'sha https:// manzilni yozing va `docker compose up -d bot` qiling.",
            reason,
        )
