from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.user import UserRole


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


class DillerPublic(BaseModel):
    """Mijozga ko'rinadigan diller ma'lumoti."""
    id: int
    name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    region: Optional[str] = None
    work_hours: Optional[str] = None


class ShopResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    diller: Optional[DillerPublic] = None


class MeUser(BaseModel):
    id: int
    username: str
    role: UserRole
    full_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_id: Optional[int] = None


class MeResponse(BaseModel):
    user: MeUser
    shop: Optional[ShopResponse] = None


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    me: MeResponse


class TelegramAuthIn(BaseModel):
    init_data: str = Field(min_length=10, max_length=4096)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class RefreshIn(BaseModel):
    refresh_token: str


class ShopFields(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=5, max_length=50)
    address: str = Field(min_length=3, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    _strip = field_validator("name", "phone", "address", mode="before")(
        lambda v: v.strip() if isinstance(v, str) else v
    )


class ShopRegister(ShopFields):
    """Ro'yxatdan o'tish: mijoz ismi + do'kon ma'lumoti + diller tanlash."""
    full_name: str = Field(min_length=2, max_length=255)
    diller_id: int

    _strip_name = field_validator("full_name", mode="before")(
        lambda v: v.strip() if isinstance(v, str) else v
    )


class ShopUpdate(ShopFields):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)


# ---------- Admin ----------

class DillerCreate(BaseModel):
    username: str = Field(min_length=3, max_length=255, pattern=r"^[A-Za-z0-9_.\-]+$")
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    telegram_id: Optional[int] = None
    company_name: Optional[str] = Field(default=None, max_length=255)
    region: Optional[str] = Field(default=None, max_length=255)
    work_hours: Optional[str] = Field(default=None, max_length=255)

    _empty_to_none = field_validator("phone", "company_name", "region", "work_hours", mode="before")(_clean)


class DillerUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    telegram_id: Optional[int] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    company_name: Optional[str] = Field(default=None, max_length=255)
    region: Optional[str] = Field(default=None, max_length=255)
    work_hours: Optional[str] = Field(default=None, max_length=255)

    _empty_to_none = field_validator("phone", "company_name", "region", "work_hours", mode="before")(_clean)


class DillerAdminResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_id: Optional[int] = None
    company_name: Optional[str] = None
    region: Optional[str] = None
    work_hours: Optional[str] = None
    is_blocked: bool
    shops_count: int = 0
    orders_count: int = 0
    created_at: datetime


class AdminUserUpdate(BaseModel):
    """Superadmin mijoz va uning do'konini tahrirlaydi."""
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    shop_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    shop_phone: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    model_config = ConfigDict(extra="forbid")


class ReassignPayload(BaseModel):
    diller_id: int


class AdminUserResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    telegram_id: Optional[int] = None
    is_blocked: bool
    created_at: datetime
    shop: Optional[ShopResponse] = None
    orders_count: int = 0
    total_spent: int = 0


class ClientResponse(BaseModel):
    """Dillerning mijozi (do'kon)."""
    shop_id: int
    shop_name: str
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    orders_count: int = 0
    total_spent: int = 0
    last_order_at: Optional[datetime] = None
    joined_at: datetime
