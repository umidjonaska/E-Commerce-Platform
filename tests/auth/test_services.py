import pytest
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.auth.services import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
    authenticate_user,
    get_current_user,
    get_current_admin_user,
    ACCESS,
    REFRESH,
)
from app.schemas.user import UserRole


# ---------- PASSWORD ----------

def test_password_hash_and_verify_success():
    hashed = get_password_hash("mypassword123")

    assert hashed != "mypassword123"
    assert hashed.startswith("$argon2")
    assert verify_password("mypassword123", hashed) is True


def test_verify_password_wrong():
    hashed = get_password_hash("correctpassword")

    assert verify_password("wrongpassword", hashed) is False


# ---------- JWT ----------

@pytest.mark.asyncio
async def test_create_and_verify_access_token_roundtrip():
    token = await create_access_token({"sub": "user@mail.ru"})

    payload = await verify_token(token)

    assert payload["sub"] == "user@mail.ru"
    assert "exp" in payload


@pytest.mark.asyncio
async def test_create_and_verify_refresh_token_roundtrip():
    token = await create_refresh_token({"sub": "user@mail.ru"})

    payload = await verify_token(token)

    assert payload["sub"] == "user@mail.ru"


@pytest.mark.asyncio
async def test_verify_token_invalid_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        await verify_token("not.a.valid.token")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_token_tampered_raises_401():
    token = await create_access_token({"sub": "user@mail.ru"})
    tampered = token[:-2] + "xx"  # imzoni buzamiz

    with pytest.raises(HTTPException) as exc_info:
        await verify_token(tampered)

    assert exc_info.value.status_code == 401


# ---------- AUTHENTICATE USER ----------

@pytest.mark.asyncio
async def test_authenticate_user_success():
    db = AsyncMock()

    hashed_pw = get_password_hash("correctpassword")
    fake_user = MagicMock(username="testuser", password_hash=hashed_pw)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = fake_user
    db.execute.return_value = result_mock

    user = await authenticate_user(db, "testuser", "correctpassword")

    assert user is fake_user


@pytest.mark.asyncio
async def test_authenticate_user_wrong_password():
    db = AsyncMock()

    hashed_pw = get_password_hash("correctpassword")
    fake_user = MagicMock(username="testuser", password_hash=hashed_pw)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = fake_user
    db.execute.return_value = result_mock

    user = await authenticate_user(db, "testuser", "wrongpassword")

    assert user is None


@pytest.mark.asyncio
async def test_authenticate_user_not_found():
    db = AsyncMock()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute.return_value = result_mock

    user = await authenticate_user(db, "ghost", "anypassword")

    assert user is None


# ---------- TOKEN TURI ----------

@pytest.mark.asyncio
async def test_refresh_token_is_rejected_as_access_token():
    refresh = await create_refresh_token({"sub": "1"})

    with pytest.raises(HTTPException) as exc_info:
        await verify_token(refresh, ACCESS)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_access_token_is_rejected_as_refresh_token():
    access = await create_access_token({"sub": "1"})

    with pytest.raises(HTTPException) as exc_info:
        await verify_token(access, REFRESH)

    assert exc_info.value.status_code == 401


# ---------- GET CURRENT USER (DB'dan, keshsiz) ----------

def _db_returning(user):
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute.return_value = result_mock
    return db


@pytest.mark.asyncio
async def test_get_current_user_reads_user_from_db():
    token = await create_access_token({"sub": "2"})
    fake_user = MagicMock(id=2, email="fresh@mail.ru", username="fresh", role=UserRole.USER,
                          full_name="Fresh", phone=None, is_blocked=False)

    user_data = await get_current_user(token=token, db=_db_returning(fake_user))

    assert user_data["id"] == 2
    assert user_data["role"] == "user"


@pytest.mark.asyncio
async def test_get_current_user_not_found_in_db_raises_401():
    token = await create_access_token({"sub": "99"})

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=_db_returning(None))

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_blocked_raises_403():
    token = await create_access_token({"sub": "3"})
    blocked = MagicMock(id=3, role=UserRole.USER, is_blocked=True)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=_db_returning(blocked))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_current_user_rejects_refresh_token():
    refresh = await create_refresh_token({"sub": "2"})

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=refresh, db=AsyncMock())

    assert exc_info.value.status_code == 401


# ---------- ADMIN CHECK ----------

@pytest.mark.asyncio
async def test_get_current_admin_user_forbidden_for_regular_user():
    current_user = {"id": 1, "email": "user@mail.ru", "role": UserRole.USER.value}

    with pytest.raises(HTTPException) as exc_info:
        await get_current_admin_user(current_user=current_user)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_current_admin_user_success_for_admin():
    current_user = {"id": 1, "email": "admin@mail.ru", "role": UserRole.ADMIN.value}

    result = await get_current_admin_user(current_user=current_user)

    assert result == current_user