from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_PRICE = 1_000_000_000
UNITS = ("dona", "kg", "litr", "quti", "pachka", "tray", "blok")


def _strip(value):
    return value.strip() if isinstance(value, str) else value


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    sort_order: int = Field(default=0, ge=0, le=10_000)
    is_active: bool = True

    _s = field_validator("name", mode="before")(_strip)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    sort_order: Optional[int] = Field(default=None, ge=0, le=10_000)
    is_active: Optional[bool] = None

    _s = field_validator("name", mode="before")(_strip)


class CategoryResponse(BaseModel):
    id: int
    name: str
    sort_order: int
    is_active: bool
    products_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductIn(BaseModel):
    category_id: int
    name: str = Field(min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    price: int = Field(ge=0, le=MAX_PRICE)
    unit: str = Field(default="dona", min_length=1, max_length=20)
    min_quantity: int = Field(default=1, ge=1, le=100_000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True

    _s = field_validator("name", "description", "unit", mode="before")(_strip)

    @field_validator("image_url")
    @classmethod
    def _image_must_be_upload(cls, value):
        # Faqat o'z serverimizga yuklangan rasmlarga ruxsat: tashqi URL orqali tracking/XSS oldini olish
        if value and not value.startswith("/uploads/"):
            raise ValueError("Rasm URL'i /uploads/ bilan boshlanishi kerak")
        return value or None


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    price: Optional[int] = Field(default=None, ge=0, le=MAX_PRICE)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=20)
    min_quantity: Optional[int] = Field(default=None, ge=1, le=100_000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None

    _s = field_validator("name", "description", "unit", mode="before")(_strip)

    @field_validator("image_url")
    @classmethod
    def _image_must_be_upload(cls, value):
        if value and not value.startswith("/uploads/"):
            raise ValueError("Rasm URL'i /uploads/ bilan boshlanishi kerak")
        return value or None


class ProductResponse(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    price: int
    unit: str
    min_quantity: int
    image_url: Optional[str] = None
    is_active: bool
    created_at: datetime
