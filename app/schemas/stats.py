from datetime import date
from typing import Optional

from pydantic import BaseModel


class StatsTotals(BaseModel):
    # Davrda YARATILGAN buyurtmalar soni
    orders_count: int = 0
    # Davrda YETKAZILGAN (delivered_at bo'yicha) buyurtmalar, ularning summasi va o'rtacha chek
    delivered_count: int = 0
    sales_amount: int = 0
    average_order: int = 0
    # Davrda bekor qilingan (cancelled_at bo'yicha)
    cancelled_count: int = 0
    # Hozirgi holat (davrga bog'liq emas): javob kutayotgan va yetkazilishi kerak buyurtmalar
    pending_now: int = 0
    confirmed_now: int = 0
    clients_count: int = 0


class StatsPoint(BaseModel):
    date: date
    orders: int = 0
    delivered: int = 0
    sales: int = 0


class TopProduct(BaseModel):
    name: str
    quantity: int
    amount: int


class DillerStat(BaseModel):
    diller_id: int
    name: str
    delivered_count: int
    sales_amount: int


class StatsResponse(BaseModel):
    date_from: date
    date_to: date
    totals: StatsTotals
    series: list[StatsPoint]
    top_products: list[TopProduct]
    top_dillers: Optional[list[DillerStat]] = None
