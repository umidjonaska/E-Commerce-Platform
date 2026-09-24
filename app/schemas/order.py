from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ITEMS_PER_ORDER = 50
MAX_QUANTITY = 100_000


class OrderStatus(str, Enum):
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    DELIVERED = 'delivered'
    CANCELLED = 'cancelled'


# Ruxsat etilgan holat o'tishlari (biznes qoidasi - faqat backendda)
ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.DELIVERED, OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}


class CancelledBy(str, Enum):
    CLIENT = 'client'
    DILLER = 'diller'
    SUPERADMIN = 'superadmin'


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=MAX_QUANTITY)


def _validate_items(items: list[OrderItemIn]) -> list[OrderItemIn]:
    if not items:
        raise ValueError("Buyurtmada kamida bitta mahsulot bo'lishi kerak")
    if len(items) > MAX_ITEMS_PER_ORDER:
        raise ValueError(f"Buyurtmada {MAX_ITEMS_PER_ORDER} tadan ortiq mahsulot bo'lmaydi")
    return items


class OrderCreate(BaseModel):
    items: list[OrderItemIn]
    note: Optional[str] = Field(default=None, max_length=1000)
    delivery_address: Optional[str] = Field(default=None, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    _check_items = field_validator("items")(_validate_items)


class OrderUpdate(BaseModel):
    """Mijoz buyurtmani tahrirlaydi (faqat PENDING holatida). Mahsulotlar to'liq almashtiriladi."""
    items: list[OrderItemIn]
    note: Optional[str] = Field(default=None, max_length=1000)
    delivery_address: Optional[str] = Field(default=None, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    _check_items = field_validator("items")(_validate_items)


class RejectPayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminStatusChange(BaseModel):
    status: OrderStatus
    reason: Optional[str] = Field(default=None, max_length=500)


class OrderItemResponse(BaseModel):
    id: int
    product_id: Optional[int] = None
    product_name: str
    unit: str
    unit_price: int
    quantity: int
    line_total: int

    model_config = ConfigDict(from_attributes=True)


class OrderShopInfo(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderDillerInfo(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None


class OrderResponse(BaseModel):
    id: int
    status: OrderStatus
    shop_id: Optional[int] = None
    shop_name: Optional[str] = None
    diller_id: Optional[int] = None
    diller_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    note: Optional[str] = None
    total_amount: int
    items_count: int
    reject_reason: Optional[str] = None
    cancelled_by: Optional[CancelledBy] = None
    items: list[OrderItemResponse]
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    can_edit: bool = False
    can_cancel: bool = False
