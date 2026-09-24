import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.api import app
from app.database.database import get_db
from app.auth.services import get_current_user


@pytest_asyncio.fixture
async def client(session):
    """
    app'ga HTTP so'rov yuboradigan async client.
    get_db override qilinadi (test session bilan).
    """

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def authorized_client(client, current_user_override):
    """
    get_current_user override qilingan holatdagi client.
    current_user_override har bir test faylida (yoki test ichida) beriladi.
    """

    async def override_get_current_user():
        return current_user_override

    app.dependency_overrides[get_current_user] = override_get_current_user
    yield client

# ---------- Rollar bo'yicha tayyor userlar va clientlar ----------

from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserRole


async def _make_user(session, username: str, role: UserRole):
    payload = UserCreate(username=username, email=f"{username}@mail.ru", role=role, password_hash="123")
    return await UserRepository(session).create_user(payload)


@pytest_asyncio.fixture
async def superadmin_user(session):
    return await _make_user(session, "superadminuser", UserRole.SUPERADMIN)


@pytest_asyncio.fixture
async def diller_user(session):
    return await _make_user(session, "dilleruser", UserRole.DILLER)


def _as(user):
    async def override():
        return {"id": user.id, "email": user.email, "role": user.role.value}
    return override


@pytest_asyncio.fixture
async def superadmin_client(client, superadmin_user):
    app.dependency_overrides[get_current_user] = _as(superadmin_user)
    yield client


@pytest_asyncio.fixture
async def diller_client(client, diller_user):
    app.dependency_overrides[get_current_user] = _as(diller_user)
    yield client
