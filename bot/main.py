import asyncio
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


async def main():
    logging.basicConfig(level=logging.INFO)

    bot = Bot(
        token=config.token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    dp.include_router(start.router)

    await setup(bot)
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
