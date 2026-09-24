"""Telegram botni backend ichida webhook orqali ishlatish.

Render'ning bepul rejasida doimiy ishlaydigan worker yo'q. Webhook rejimida
Telegram update'larni shu backendga POST qiladi, shuning uchun bot uchun alohida
servis kerak emas. Backend uxlab qolgan bo'lsa, Telegram so'rovi uni uyg'otadi:
birinchi javob kechikadi, lekin xabar yo'qolmaydi - Telegram uni qayta yuboradi.
"""
import hashlib
import hmac
import logging

from app.core.config import config

logger = logging.getLogger(__name__)

WEBHOOK_PATH = "/telegram/webhook"


def webhook_enabled() -> bool:
    return bool(config.telegram.bot_token) and config.telegram.webhook_base_url.startswith("https://")


def webhook_secret() -> str:
    """Telegram har so'rovda `X-Telegram-Bot-Api-Secret-Token` sarlavhasida qaytaradigan qiymat.

    SECRET_KEY va bot tokenidan hosil qilinadi: alohida sozlash shart emas va uni
    tashqaridan taxmin qilib, soxta update yuborib bo'lmaydi.
    """
    message = f"telegram-webhook:{config.telegram.bot_token}".encode()
    return hmac.new(config.app.secret_key.encode(), message, hashlib.sha256).hexdigest()


class TelegramWebhook:
    def __init__(self) -> None:
        self._bot = None
        self._dp = None

    @property
    def ready(self) -> bool:
        return self._bot is not None and self._dp is not None

    def verify(self, secret: str | None) -> bool:
        return bool(secret) and hmac.compare_digest(secret, webhook_secret())

    async def startup(self) -> None:
        if not webhook_enabled():
            logger.info("Telegram webhook o'chiq: BOT_TOKEN yoki tashqi HTTPS manzil berilmagan")
            return

        # bot paketi faqat shu yerda yuklanadi: u import paytida BOT_TOKEN talab qiladi
        from bot.dispatcher import create_bot, create_dispatcher, setup

        self._bot = create_bot(config.telegram.bot_token)
        self._dp = create_dispatcher()
        url = config.telegram.webhook_base_url + WEBHOOK_PATH

        # Ikkala chaqiruv ham xato bersa, API ishlashda davom etadi. Oldingi deploy
        # o'rnatgan webhook Telegram'da saqlanib qolgani uchun update'lar baribir keladi.
        try:
            await self._bot.set_webhook(
                url,
                secret_token=webhook_secret(),
                allowed_updates=self._dp.resolve_used_update_types(),
                drop_pending_updates=False,
            )
            logger.info("Telegram webhook o'rnatildi: %s", url)
        except Exception:
            logger.exception("Telegram webhook o'rnatilmadi: %s", url)

        try:
            await setup(self._bot)
        except Exception:
            logger.exception("Bot buyruqlari va menyu tugmasi sozlanmadi")

    async def process(self, data: dict) -> None:
        from aiogram.types import Update

        try:
            update = Update.model_validate(data, context={"bot": self._bot})
            await self._dp.feed_update(self._bot, update)
        except Exception:
            # Javob allaqachon yuborilgan: xato faqat logga yoziladi, aks holda
            # Telegram buzilgan update'ni cheksiz qayta yuborib turardi.
            logger.exception("Telegram update qayta ishlanmadi")

    async def shutdown(self) -> None:
        # Webhook ataylab o'chirilmaydi: Render servisni uxlatadi va qayta ishga
        # tushiradi, webhook qolsa Telegram keyingi so'rov bilan uni uyg'otadi.
        if self._bot is not None:
            await self._bot.session.close()
        self._bot = self._dp = None


telegram_webhook = TelegramWebhook()
