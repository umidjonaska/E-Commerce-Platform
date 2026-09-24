"""Login oqimlari: Telegram Mini App, username/parol (diller, superadmin) va token yangilash."""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.login import user_from_refresh_token
from app.auth.services import (
    authenticate_user,
    ensure_active,
    issue_tokens,
    unusable_password_hash,
)
from app.models.user import User
from app.repositories.shop import ShopRepository
from app.schemas.user import UserRole
from app.services.shop import ShopService
from app.services.telegram_auth import validate_init_data


async def _session(db: AsyncSession, user: User) -> dict:
    access_token, refresh_token = await issue_tokens(db, user)
    me = await ShopService(ShopRepository(db)).me(user.id)
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer", "me": me}


async def telegram_login(db: AsyncSession, init_data: str) -> dict:
    """initData imzosi tekshiriladi. Yangi Telegram user avtomatik USER roli bilan yaratiladi."""
    tg = validate_init_data(init_data)
    repo = ShopRepository(db)

    user = await repo.get_user_by_telegram_id(tg.id)
    if user is None:
        user = User(
            username=f"tg_{tg.id}",
            email=None,
            password_hash=unusable_password_hash(),
            role=UserRole.USER,
            telegram_id=tg.id,
            full_name=tg.full_name or tg.username,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Parallel so'rov xuddi shu userni yaratib bo'lgan bo'lishi mumkin
            await db.rollback()
            user = await repo.get_user_by_telegram_id(tg.id)
            if user is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ro'yxatdan o'tib bo'lmadi, qayta urinib ko'ring")
        else:
            await db.refresh(user)

    ensure_active(user)
    return await _session(db, user)


async def password_login(db: AsyncSession, username: str, password: str) -> dict:
    user = await authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login yoki parol xato")
    ensure_active(user)
    return await _session(db, user)


async def refresh_session(db: AsyncSession, refresh_token: str) -> dict:
    user = await user_from_refresh_token(db, refresh_token)
    return await _session(db, user)
