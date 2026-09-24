from fastapi import APIRouter, BackgroundTasks, Depends

from app.auth.services import get_current_client_user
from app.deps import order_service_dp
from app.schemas.common import OffsetPage, PageQuery
from app.schemas.order import OrderCreate, OrderResponse, OrderStatus, OrderUpdate
from app.services.order import OrderService

router = APIRouter(prefix="/orders")


@router.post("", response_model=OrderResponse, status_code=201, summary="Yangi buyurtma berish")
async def create_order(
    payload: OrderCreate,
    bg: BackgroundTasks,
    current_user: dict = Depends(get_current_client_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.create(current_user, payload, bg)


@router.get("", response_model=OffsetPage[OrderResponse], summary="Mening buyurtmalarim")
async def my_orders(
    status: OrderStatus | None = None,
    page: PageQuery = Depends(),
    current_user: dict = Depends(get_current_client_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.list_for_client(current_user["id"], page, status)


@router.get("/{order_id}", response_model=OrderResponse, summary="Buyurtma tafsiloti")
async def my_order(
    order_id: int,
    current_user: dict = Depends(get_current_client_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.get_for_client(current_user["id"], order_id)


@router.put("/{order_id}", response_model=OrderResponse, summary="Buyurtmani tahrirlash (faqat PENDING)")
async def update_order(
    order_id: int,
    payload: OrderUpdate,
    bg: BackgroundTasks,
    current_user: dict = Depends(get_current_client_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.update_for_client(current_user["id"], order_id, payload, bg)


@router.post("/{order_id}/cancel", response_model=OrderResponse, summary="Buyurtmani bekor qilish (faqat PENDING)")
async def cancel_order(
    order_id: int,
    bg: BackgroundTasks,
    current_user: dict = Depends(get_current_client_user),
    service: OrderService = Depends(order_service_dp),
):
    return await service.cancel_for_client(current_user["id"], order_id, bg)
