from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.schemas.shop import LoginIn, RefreshIn, SessionResponse, TelegramAuthIn
from app.services import session as session_service

router = APIRouter(prefix="/auth")


@router.post("/telegram", response_model=SessionResponse, summary="Telegram Mini App orqali kirish (initData)")
async def telegram_login(payload: TelegramAuthIn, db: AsyncSession = Depends(get_db)):
    return await session_service.telegram_login(db, payload.init_data)


@router.post("/login", response_model=SessionResponse, summary="Username/parol bilan kirish (diller, superadmin)")
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    return await session_service.password_login(db, payload.username, payload.password)


@router.post("/refresh", response_model=SessionResponse, summary="Tokenni yangilash")
async def refresh(payload: RefreshIn, db: AsyncSession = Depends(get_db)):
    return await session_service.refresh_session(db, payload.refresh_token)
