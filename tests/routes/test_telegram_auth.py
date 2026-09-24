"""Telegram Mini App orqali kirish: initData imzosini tekshirish va user yaratish."""
import time

import pytest

from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserRole
from app.services.telegram_auth import build_init_data

API = "/api/v1"
BOT_TOKEN = "123456:TEST-TOKEN-FOR-UNIT-TESTS"


@pytest.fixture(autouse=True)
def bot_token(monkeypatch):
    from app.core.config import config

    monkeypatch.setattr(config.telegram, "bot_token", BOT_TOKEN)
    return BOT_TOKEN


def init_data(user_id: int = 55501, token: str = BOT_TOKEN, auth_date: int | None = None, **user_fields) -> str:
    user = {"id": user_id, "first_name": "Aziz", "last_name": "Karimov", "username": "aziz", **user_fields}
    return build_init_data(user, token, auth_date=auth_date)


@pytest.mark.asyncio
async def test_first_login_creates_user(client):
    r = await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["me"]["user"]["telegram_id"] == 55501
    assert data["me"]["user"]["role"] == "user"
    assert data["me"]["user"]["full_name"] == "Aziz Karimov"
    # Hali ro'yxatdan o'tmagan: do'kon yo'q
    assert data["me"]["shop"] is None


@pytest.mark.asyncio
async def test_second_login_reuses_same_user(client):
    first = (await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})).json()
    second = (await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})).json()

    assert first["me"]["user"]["id"] == second["me"]["user"]["id"]


@pytest.mark.asyncio
async def test_issued_token_works_on_api(client):
    session_data = (await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})).json()

    r = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {session_data['access_token']}"})

    assert r.status_code == 200
    assert r.json()["user"]["telegram_id"] == 55501


@pytest.mark.asyncio
async def test_wrong_signature_rejected(client):
    forged = init_data(token="999999:SOMEONE-ELSES-TOKEN")

    r = await client.post(f"{API}/auth/telegram", json={"init_data": forged})

    assert r.status_code == 401


@pytest.mark.asyncio
async def test_tampered_user_rejected(client):
    raw = init_data()
    # Imzo o'zgarmasdan user ma'lumotini almashtirishga urinish
    tampered = raw.replace("Aziz", "Hacker")

    r = await client.post(f"{API}/auth/telegram", json={"init_data": tampered})

    assert r.status_code == 401


@pytest.mark.asyncio
async def test_expired_init_data_rejected(client):
    old = init_data(auth_date=int(time.time()) - 90000)  # 25 soat oldin

    r = await client.post(f"{API}/auth/telegram", json={"init_data": old})

    assert r.status_code == 401


@pytest.mark.asyncio
async def test_garbage_init_data_rejected(client):
    for payload in ("not-even-query-string", "hash=abc&auth_date=1", "user=%7B%7D&auth_date=1&hash=x"):
        r = await client.post(f"{API}/auth/telegram", json={"init_data": payload})
        assert r.status_code in (401, 422), payload


@pytest.mark.asyncio
async def test_login_refused_when_bot_token_missing(client, monkeypatch):
    from app.core.config import config

    monkeypatch.setattr(config.telegram, "bot_token", "")

    r = await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})

    assert r.status_code == 503


@pytest.mark.asyncio
async def test_blocked_user_cannot_login(client, session):
    user = await UserRepository(session).create_user(
        UserCreate(username="tg_55501", email=None, role=UserRole.USER, password_hash="x", telegram_id=55501)
    )
    user.is_blocked = True
    await session.commit()

    r = await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})

    assert r.status_code == 403


@pytest.mark.asyncio
async def test_existing_telegram_user_keeps_role_and_shop(client, session):
    """Diller ham Mini App orqali kira oladi, roli o'zgarmaydi."""
    await UserRepository(session).create_user(
        UserCreate(username="diller_tg", email=None, role=UserRole.DILLER, password_hash="x", telegram_id=55501)
    )

    r = await client.post(f"{API}/auth/telegram", json={"init_data": init_data()})

    assert r.status_code == 200
    assert r.json()["me"]["user"]["role"] == "diller"
    assert r.json()["me"]["user"]["username"] == "diller_tg"
