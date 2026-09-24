"""Botni polling rejimida ishga tushirish (lokal ishlab chiqish yoki alohida worker).

Productionda bot backend ichida webhook orqali ishlaydi. Bir token uchun
Telegram faqat bitta rejimni qo'llaydi: polling boshlash webhookni o'chiradi.
Shuning uchun token'da webhook o'rnatilgan bo'lsa, polling ataylab
boshlanmaydi - aks holda lokal nusxa production botni "o'g'irlab" qo'yadi.
"""
import asyncio
import logging
import os

from bot.config import config
from bot.dispatcher import create_bot, create_dispatcher, setup

logger = logging.getLogger(__name__)


def _force_polling() -> bool:
    return os.getenv("BOT_FORCE_POLLING", "").strip().lower() in {"1", "true", "yes"}


async def main():
    logging.basicConfig(level=logging.INFO)

    bot = create_bot(config.token)
    dp = create_dispatcher()

    try:
        webhook = await bot.get_webhook_info()
        if webhook.url and not _force_polling():
            logger.error(
                "Bu token uchun webhook o'rnatilgan: %s. Bot production backend orqali "
                "ishlayapti, shuning uchun polling BOSHLANMADI (u webhookni o'chirib, "
                "production botni to'xtatib qo'yardi). Lokal sinov uchun alohida test "
                "bot tokenidan foydalaning. Webhookni ataylab almashtirish kerak bo'lsa: "
                "BOT_FORCE_POLLING=1.",
                webhook.url,
            )
            # Chiqib ketsak, `restart: unless-stopped` konteynerni qayta-qayta ishga
            # tushiradi. Jim kutib turish - loglarni to'ldirmaydi.
            await asyncio.Event().wait()
            return

        await setup(bot)
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
