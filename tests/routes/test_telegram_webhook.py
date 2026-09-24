"""Telegram bot backend ichida webhook orqali ishlaydi.

Testlar Telegram'ga HECH QACHON haqiqiy so'rov yubormaydi: bot va dispatcher
soxta obyektlar bilan almashtiriladi. Lokal .env dagi haqiqiy token bilan
`set_webhook` chaqirilsa, production botning webhooki buzilib ketardi.
"""
import asyncio
import os
import sys
import types
from unittest.mock import AsyncMock

import pytest

from app.core.config import config
from app.services.telegram_webhook import (
    WEBHOOK_PATH,
    TelegramWebhook,
    telegram_webhook,
    webhook_enabled,
    webhook_secret,
)

UPDATE = {
    "update_id": 1001,
    "message": {
        "message_id": 7,
        "date": 1700000000,
        "chat": {"id": 42, "type": "private"},
        "from": {"id": 42, "is_bot": False, "first_name": "Test"},
        "text": "/start",
    },
}


class FakeBot:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.webhook = None
        self.session = types.SimpleNamespace(close=AsyncMock())

    async def set_webhook(self, url, **kwargs):
        if self.fail:
            raise RuntimeError("Telegram ishlamayapti")
        self.webhook = (url, kwargs)


class FakeDispatcher:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.updates = []

    def resolve_used_update_types(self):
        return ["message"]

    async def feed_update(self, bot, update):
        if self.fail:
            raise RuntimeError("handler xatosi")
        self.updates.append(update)


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(config.telegram, "bot_token", "123456:TEST-TOKEN")
    monkeypatch.setattr(config.telegram, "webhook_base_url", "https://api.example.com")


@pytest.fixture
def ready(enabled, monkeypatch):
    dp = FakeDispatcher()
    monkeypatch.setattr(telegram_webhook, "_bot", FakeBot())
    monkeypatch.setattr(telegram_webhook, "_dp", dp)
    return dp


@pytest.fixture
def fake_bot_package(monkeypatch):
    """`bot.dispatcher` o'rniga soxta modul: aiogram tarmoqqa umuman chiqmaydi."""
    created = {"bots": [], "setup": 0, "fail": False}

    def create_bot(token):
        bot = FakeBot(fail=created["fail"])
        created["bots"].append((token, bot))
        return bot

    async def setup(bot):
        created["setup"] += 1

    module = types.ModuleType("bot.dispatcher")
    module.create_bot = create_bot
    module.create_dispatcher = FakeDispatcher
    module.setup = setup
    monkeypatch.setitem(sys.modules, "bot.dispatcher", module)
    return created


def secret_header():
    return {"X-Telegram-Bot-Api-Secret-Token": webhook_secret()}


# ---------- Qachon yoqiladi ----------


def test_webhook_disabled_without_https_base_url(monkeypatch):
    monkeypatch.setattr(config.telegram, "bot_token", "123456:TEST-TOKEN")
    for base in ("", "http://api.example.com"):
        monkeypatch.setattr(config.telegram, "webhook_base_url", base)
        assert webhook_enabled() is False


def test_webhook_disabled_without_token(monkeypatch):
    monkeypatch.setattr(config.telegram, "bot_token", "")
    monkeypatch.setattr(config.telegram, "webhook_base_url", "https://api.example.com")
    assert webhook_enabled() is False


def test_secret_is_telegram_compatible_and_depends_on_secret_key(enabled, monkeypatch):
    first = webhook_secret()
    # Telegram talabi: 1-256 belgi, faqat A-Z a-z 0-9 _ -
    assert len(first) == 64 and all(c in "0123456789abcdef" for c in first)

    monkeypatch.setattr(config.app, "secret_key", "boshqa-" + "x" * 40)
    assert webhook_secret() != first


# ---------- Endpoint ----------


async def test_endpoint_not_found_when_disabled(client, monkeypatch):
    monkeypatch.setattr(config.telegram, "webhook_base_url", "")

    response = await client.post(WEBHOOK_PATH, json=UPDATE)

    assert response.status_code == 404


async def test_endpoint_rejects_missing_secret(client, ready):
    response = await client.post(WEBHOOK_PATH, json=UPDATE)

    assert response.status_code == 403
    assert ready.updates == []


async def test_endpoint_rejects_wrong_secret(client, ready):
    response = await client.post(
        WEBHOOK_PATH, json=UPDATE, headers={"X-Telegram-Bot-Api-Secret-Token": "a" * 64}
    )

    assert response.status_code == 403
    assert ready.updates == []


async def test_endpoint_asks_telegram_to_retry_until_bot_is_ready(client, enabled, monkeypatch):
    monkeypatch.setattr(telegram_webhook, "_bot", None)
    monkeypatch.setattr(telegram_webhook, "_dp", None)

    response = await client.post(WEBHOOK_PATH, json=UPDATE, headers=secret_header())

    assert response.status_code == 503


async def test_endpoint_rejects_invalid_json(client, ready):
    response = await client.post(
        WEBHOOK_PATH,
        content=b"not json",
        headers={**secret_header(), "Content-Type": "application/json"},
    )

    assert response.status_code == 400


async def test_endpoint_feeds_update_to_dispatcher(client, ready):
    response = await client.post(WEBHOOK_PATH, json=UPDATE, headers=secret_header())

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(ready.updates) == 1
    assert ready.updates[0].update_id == 1001
    assert ready.updates[0].message.text == "/start"


async def test_endpoint_is_hidden_from_openapi(client):
    schema = (await client.get("/openapi.json")).json()

    assert WEBHOOK_PATH not in schema["paths"]


# ---------- Servis ----------


async def test_startup_sets_webhook_with_secret(enabled, fake_bot_package):
    webhook = TelegramWebhook()

    await webhook.startup()

    token, bot = fake_bot_package["bots"][0]
    url, kwargs = bot.webhook
    assert token == "123456:TEST-TOKEN"
    assert url == "https://api.example.com/telegram/webhook"
    assert kwargs["secret_token"] == webhook_secret()
    assert kwargs["allowed_updates"] == ["message"]
    # Backend uxlab qolgan paytda kelgan xabarlar tashlab yuborilmasligi kerak
    assert kwargs["drop_pending_updates"] is False
    assert fake_bot_package["setup"] == 1
    assert webhook.ready

    await webhook.shutdown()

    bot.session.close.assert_awaited_once()
    assert not webhook.ready


async def test_startup_does_nothing_when_disabled(monkeypatch, fake_bot_package):
    monkeypatch.setattr(config.telegram, "webhook_base_url", "")
    webhook = TelegramWebhook()

    await webhook.startup()
    await webhook.shutdown()

    assert fake_bot_package["bots"] == []
    assert not webhook.ready


async def test_startup_survives_telegram_errors(enabled, fake_bot_package):
    """Telegram vaqtincha ishlamasa ham API ko'tariladi va update'larni qabul qiladi
    (oldingi deploy o'rnatgan webhook Telegram'da saqlanib qoladi)."""
    fake_bot_package["fail"] = True
    webhook = TelegramWebhook()

    await webhook.startup()

    assert webhook.ready
    await webhook.shutdown()


async def test_process_logs_handler_errors_instead_of_raising(enabled):
    webhook = TelegramWebhook()
    webhook._bot, webhook._dp = FakeBot(), FakeDispatcher(fail=True)

    await webhook.process(UPDATE)  # xato tashqariga chiqmasligi kerak


# ---------- Polling himoyasi ----------


def _patch_bot_main(monkeypatch, webhook_url: str):
    monkeypatch.setenv("BOT_TOKEN", os.environ.get("BOT_TOKEN") or "123456:TEST-TOKEN")
    monkeypatch.delenv("BOT_FORCE_POLLING", raising=False)
    import bot.main as bot_main

    bot = FakeBot()
    bot.get_webhook_info = AsyncMock(return_value=types.SimpleNamespace(url=webhook_url))
    bot.delete_webhook = AsyncMock()
    dp = types.SimpleNamespace(start_polling=AsyncMock())
    monkeypatch.setattr(bot_main, "create_bot", lambda token: bot)
    monkeypatch.setattr(bot_main, "create_dispatcher", lambda: dp)
    monkeypatch.setattr(bot_main, "setup", AsyncMock())
    return bot_main, bot, dp


async def test_polling_refuses_to_steal_a_bot_that_has_a_webhook(monkeypatch):
    """Lokal nusxa production tokeni bilan ishga tushsa, webhookni o'chirmasligi kerak."""
    bot_main, bot, dp = _patch_bot_main(monkeypatch, "https://prod.example.com/telegram/webhook")

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(bot_main.main(), timeout=0.3)

    bot.delete_webhook.assert_not_awaited()
    dp.start_polling.assert_not_awaited()
    bot.session.close.assert_awaited_once()


async def test_polling_starts_when_no_webhook_is_set(monkeypatch):
    bot_main, bot, dp = _patch_bot_main(monkeypatch, "")

    await bot_main.main()

    bot.delete_webhook.assert_awaited_once()
    dp.start_polling.assert_awaited_once_with(bot)
