from pydantic import BaseModel, EmailStr, ConfigDict, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class UserRole(str, Enum):
    SUPERADMIN = 'superadmin'
    # ADMIN eski rol: Postgres enum'idan qiymatni olib tashlab bo'lmaydi,
    # shuning uchun saqlab qolingan. Migratsiya ADMIN userlarni DILLER'ga o'tkazadi.
    ADMIN = 'admin'
    DILLER = 'diller'
    USER = 'user'


STAFF_ROLES = (UserRole.SUPERADMIN, UserRole.DILLER, UserRole.ADMIN)


class UserCreate(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    role: UserRole = Field(UserRole.USER)
    password_hash: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_id: Optional[int] = None


class UserUpdate(BaseModel):
    """Admin tomonidan yangilash (role, is_blocked kabi maydonlar bilan)."""
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    password_hash: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_blocked: Optional[bool] = None


class UserSelfUpdate(BaseModel):
    """Foydalanuvchi o'zini yangilashi: role/is_blocked kabi maydonlar YO'Q."""
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password_hash: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[EmailStr] = None
    role: UserRole
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_blocked: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
