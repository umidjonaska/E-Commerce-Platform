from fastapi import Depends, APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from .schema import TokenResponse, Refresh
from .services import (
    authenticate_user,
    ensure_active,
    get_user_by_id,
    hash_refresh_token,
    issue_tokens,
    verify_token,
    REFRESH,
)
from app.database.database import get_db
from app.auth.services import get_current_user

auth_route = APIRouter(tags=["Auth"])


def _token_response(user, access_token: str, refresh_token: str) -> dict:
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "role": user.role,
        },
        "role": user.role,
        "token_type": "bearer",
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


async def user_from_refresh_token(db: AsyncSession, token: str):
    """Refresh tokenni tekshiradi (turi, imzo, DB'dagi xesh) va userni qaytaradi."""
    payload = await verify_token(token, REFRESH)

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token yaroqsiz")

    user = await get_user_by_id(db, user_id)

    if not user or user.refresh_token != hash_refresh_token(token):
        raise HTTPException(status_code=401, detail="Token yaroqsiz")

    ensure_active(user)
    return user


@auth_route.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    db: AsyncSession = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login yoki parol xato",
        )
    ensure_active(user)

    access_token, refresh_token = await issue_tokens(db, user)
    return _token_response(user, access_token, refresh_token)


@auth_route.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    refresh: Refresh,
    db: AsyncSession = Depends(get_db),
):
    user = await user_from_refresh_token(db, refresh.token)

    access_token, refresh_token = await issue_tokens(db, user)
    return _token_response(user, access_token, refresh_token)


@auth_route.get("/me")
async def read_current_user(current_user=Depends(get_current_user)):
    return current_user
