from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.services import get_current_diller_user
from app.database.database import get_db
from app.deps import order_service_dp, shop_service_dp
from app.schemas.common import OffsetPage, PageQuery
from app.schemas.order import CancelledBy, OrderResponse, OrderStatus, RejectPayload
from app.schemas.shop import ClientResponse
from app.schemas.stats import StatsResponse
from app.services import stats as stats_service
from app.services.order import OrderService
from app.services.shop import ShopService
from app.utils.timeutil import Period, resolve_period

router = APIRouter(prefix="/diller")


# ---------- Statistika ----------

@router.get("/stats", response_model=StatsResponse, summary="Statistika (bugun / hafta / oy / oraliq)")
async def stats(
    period: Period = Period.today,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: dict = Depends(get_current_diller_user),
    db: AsyncSession = Depends(get_db),
):
    start, end = resolve_period(period, date_from, date_to)
    return await stats_service.build_stats(db, start, end, diller_id=current_user["id"])


# ---------- Mijozlar ----------

@router.get("/clients", response_model=OffsetPage[ClientResponse], summary="Mening mijozlarim (do'konlar)")
async def clients(
    q: str | None = Query(default=None, max_length=100),
    page: PageQuery = Depends(),
    current_user: dict = Depends(get_current_diller_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.diller_clients(current_user["id"], page, q)


@router.get("/clients/{shop_id}", response_model=ClientResponse, summary="Mijoz tafsiloti")
async def client(
    shop_id: int,
    current_user: dict = Depends(get_current_diller_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.diller_client(current_user["id"], shop_id)


# ---------- Buyurtmalar ----------

@router.get("/orders", response_model=OffsetPage[OrderResponse], summary="Buyurtmalar")
async def orders(
    status: OrderStatus | None = None,
    q: str | None = Query(default=None, max_length=100),
    shop_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: PageQuery = Depends(),
    current_user: dict = Depends(get_current_diller_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.list_for_staff(
        page, diller_id=current_user["id"], shop_id=shop_id, status_filter=status,
        q=q, date_from=date_from, date_to=date_to,
    )


@router.get("/orders/{order_id}", response_model=OrderResponse, summary="Buyurtma tafsiloti")
async def order(
    order_id: int,
    current_user: dict = Depends(get_current_diller_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.get_for_staff(order_id, diller_id=current_user["id"])


async def _transition(service, order_id, target, current_user, reason, bg):
    return await service.staff_transition(
        order_id, target, actor=CancelledBy.DILLER, diller_id=current_user["id"], reason=reason, bg=bg
    )


@router.post("/orders/{order_id}/accept", response_model=OrderResponse, summary="Buyurtmani qabul qilish")
async def accept(
    order_id: int,
    bg: BackgroundTasks,
    current_user: dict = Depends(get_current_diller_user),
    service: OrderService = Depends(order_service_dp),
):
    return await _transition(service, order_id, OrderStatus.CONFIRMED, current_user, None, bg)


@router.post("/orders/{order_id}/reject", response_model=OrderResponse, summary="Buyurtmani rad etish / bekor qilish")
async def reject(
    order_id: int,
    bg: BackgroundTasks,
    payload: RejectPayload | None = None,
    current_user: dict = Depends(get_current_diller_user),
    service: OrderService = Depends(order_service_dp),
):
    return await _transition(
        service, order_id, OrderStatus.CANCELLED, current_user, payload.reason if payload else None, bg
    )


@router.post("/orders/{order_id}/deliver", response_model=OrderResponse, summary="Yetkazildi deb belgilash")
async def deliver(
    order_id: int,
    bg: BackgroundTasks,
    current_user: dict = Depends(get_current_diller_user),
    service: OrderService = Depends(order_service_dp),
):
    return await _transition(service, order_id, OrderStatus.DELIVERED, current_user, None, bg)
