import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import config
from app.database.database import get_db
from app.models.user import User
from app.schemas.user import UserRole


# SECURITY
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

ACCESS = "access"
REFRESH = "refresh"


# PASSWORD
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # yaroqsiz/bo'sh xesh
        return False


def unusable_password_hash() -> str:
    """Parol bilan kirish mumkin bo'lmagan (Telegram orqali ro'yxatdan o'tgan) userlar uchun."""
    return get_password_hash(secrets.token_urlsafe(48))


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# JWT
async def verify_token(token: str, token_type: str | None = None) -> dict:
    """Tokenni tekshiradi. token_type berilsa, `typ` claim mos kelishi shart
    (refresh token access sifatida ishlatilishining oldi olinadi)."""
    try:
        payload = jwt.decode(
            token,
            config.app.secret_key,
            algorithms=[config.app.algorithm]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token yaroqsiz",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token_type is not None and payload.get("typ") != token_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token yaroqsiz",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _encode(data: dict, token_type: str, expires: timedelta) -> str:
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.now(timezone.utc) + expires,
        "typ": token_type,
        "jti": secrets.token_hex(8),
    })
    return jwt.encode(to_encode, config.app.secret_key, algorithm=config.app.algorithm)


async def create_access_token(data: dict) -> str:
    return _encode(data, ACCESS, timedelta(minutes=config.app.access_token_expire_minutes))


async def create_refresh_token(data: dict) -> str:
    return _encode(data, REFRESH, timedelta(days=config.app.refresh_token_expire_days))


# USER HELPERS
def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "role": user.role.value if isinstance(user.role, UserRole) else user.role,
        "full_name": user.full_name,
        "phone": user.phone,
    }


async def get_user_by_email(
    db: AsyncSession,
    email: str
) -> User | None:
    result = await db.execute(
        select(User).where(User.email == email, User.is_deleted == False)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def authenticate_user(
    db: AsyncSession,
    username: str,
    password: str
) -> User | None:
    result = await db.execute(
        select(User).where(User.username == username, User.is_deleted == False)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


async def issue_tokens(db: AsyncSession, user: User) -> tuple[str, str]:
    """Access + refresh token juftligini yaratadi va refresh xeshini saqlaydi."""
    claims = {"sub": str(user.id)}
    access_token = await create_access_token(claims)
    refresh_token = await create_refresh_token(claims)
    await user_refresh_token_update(db, user.id, refresh_token)
    return access_token, refresh_token


def ensure_active(user: User) -> None:
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akkaunt bloklangan")


# CURRENT USER
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Har so'rovda userni DB'dan PK bo'yicha o'qiydi: rol o'zgarishi va
    bloklash darhol kuchga kiradi (kesh yo'q)."""
    payload = await verify_token(token, ACCESS)

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token yaroqsiz")

    user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    ensure_active(user)

    return serialize_user(user)


# ROLE CHECKS
def require_roles(*roles: UserRole, detail: str = "Ruxsat yo'q"):
    async def dependency(current_user: dict = Depends(get_current_user)):
        if UserRole(current_user["role"]) not in roles:
            raise HTTPException(status_code=403, detail=detail)
        return current_user

    return dependency


async def get_current_admin_user(
    current_user: dict = Depends(get_current_user)
):
    role = UserRole(current_user["role"])
    if role not in (UserRole.ADMIN, UserRole.SUPERADMIN):
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
    return current_user


async def get_current_superadmin_user(
    current_user: dict = Depends(get_current_user)
):
    if UserRole(current_user["role"]) != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Faqat superadmin uchun ruxsat")
    return current_user


# Diller / staff / oddiy mijoz uchun dependency'lar
get_current_diller_user = require_roles(UserRole.DILLER, detail="Faqat diller uchun ruxsat")
get_current_client_user = require_roles(UserRole.USER, detail="Faqat mijoz (do'kon) uchun ruxsat")
get_current_staff_user = require_roles(
    UserRole.SUPERADMIN, UserRole.DILLER, UserRole.ADMIN, detail="Ruxsat yo'q"
)


# REFRESH TOKEN UPDATE
async def user_refresh_token_update(
    db: AsyncSession,
    user_id: int,
    token: str
) -> bool:
    if not token:
        raise HTTPException(
            status_code=422,
            detail="Token bo'sh"
        )

    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(refresh_token=hash_refresh_token(token))
    )
    await db.execute(stmt)
    await db.commit()

    return True
