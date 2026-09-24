from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.services import get_current_superadmin_user
from app.database.database import get_db
from app.deps import admin_service_dp, catalog_service_dp, order_service_dp
from app.schemas.catalog import (
    CategoryIn, CategoryResponse, CategoryUpdate, ProductIn, ProductResponse, ProductUpdate,
)
from app.schemas.common import OffsetPage, PageQuery
from app.schemas.order import AdminStatusChange, CancelledBy, OrderResponse, OrderStatus
from app.schemas.shop import (
    AdminUserResponse, AdminUserUpdate, DillerAdminResponse, DillerCreate, DillerUpdate, ReassignPayload,
)
from app.schemas.stats import StatsResponse
from app.services import stats as stats_service
from app.services import uploads
from app.services.admin import AdminService
from app.services.catalog import CatalogService
from app.services.order import OrderService
from app.utils.timeutil import Period, resolve_period

# Barcha /admin yo'llari faqat SUPERADMIN uchun
router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_superadmin_user)])


# ---------- Statistika ----------

@router.get("/stats", response_model=StatsResponse, summary="Umumiy statistika")
async def stats(
    period: Period = Period.today,
    date_from: date | None = None,
    date_to: date | None = None,
    diller_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    start, end = resolve_period(period, date_from, date_to)
    return await stats_service.build_stats(db, start, end, diller_id=diller_id, with_dillers=diller_id is None)


# ---------- Dillerlar ----------

@router.get("/dillers", response_model=OffsetPage[DillerAdminResponse], summary="Dillerlar ro'yxati")
async def list_dillers(
    q: str | None = Query(default=None, max_length=100),
    blocked: bool | None = None,
    page: PageQuery = Depends(),
    service: AdminService = Depends(admin_service_dp),
):
    return await service.list_dillers(page, q, blocked)


@router.post("/dillers", response_model=DillerAdminResponse, status_code=201, summary="Diller yaratish")
async def create_diller(payload: DillerCreate, service: AdminService = Depends(admin_service_dp)):
    return await service.create_diller(payload)


@router.get("/dillers/{diller_id}", response_model=DillerAdminResponse, summary="Diller tafsiloti")
async def get_diller(diller_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.get_diller(diller_id)


@router.put("/dillers/{diller_id}", response_model=DillerAdminResponse, summary="Dillerni yangilash")
async def update_diller(diller_id: int, payload: DillerUpdate, service: AdminService = Depends(admin_service_dp)):
    return await service.update_diller(diller_id, payload)


@router.post("/dillers/{diller_id}/block", response_model=DillerAdminResponse, summary="Dillerni bloklash")
async def block_diller(diller_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.set_diller_blocked(diller_id, True)


@router.post("/dillers/{diller_id}/unblock", response_model=DillerAdminResponse, summary="Blokdan chiqarish")
async def unblock_diller(diller_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.set_diller_blocked(diller_id, False)


# ---------- Mijozlar / do'konlar ----------

@router.get("/users", response_model=OffsetPage[AdminUserResponse], summary="Mijozlar (do'konlar)")
async def list_users(
    q: str | None = Query(default=None, max_length=100),
    diller_id: int | None = None,
    blocked: bool | None = None,
    page: PageQuery = Depends(),
    service: AdminService = Depends(admin_service_dp),
):
    return await service.list_users(page, q=q, diller_id=diller_id, blocked=blocked)


@router.get("/users/{user_id}", response_model=AdminUserResponse, summary="Mijoz tafsiloti")
async def get_user(user_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.get_user(user_id)


@router.put("/users/{user_id}", response_model=AdminUserResponse, summary="Mijoz/do'kon ma'lumotini tahrirlash")
async def update_user(user_id: int, payload: AdminUserUpdate, service: AdminService = Depends(admin_service_dp)):
    return await service.update_user(user_id, payload)


@router.post("/users/{user_id}/reassign", response_model=AdminUserResponse, summary="Mijozni boshqa dillerga o'tkazish")
async def reassign_user(
    user_id: int,
    payload: ReassignPayload,
    bg: BackgroundTasks,
    service: AdminService = Depends(admin_service_dp),
):
    return await service.reassign_user(user_id, payload.diller_id, bg)


@router.post("/users/{user_id}/block", response_model=AdminUserResponse, summary="Mijozni bloklash")
async def block_user(user_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.set_user_blocked(user_id, True)


@router.post("/users/{user_id}/unblock", response_model=AdminUserResponse, summary="Mijozni blokdan chiqarish")
async def unblock_user(user_id: int, service: AdminService = Depends(admin_service_dp)):
    return await service.set_user_blocked(user_id, False)


# ---------- Kategoriyalar ----------

@router.get("/categories", response_model=list[CategoryResponse], summary="Barcha kategoriyalar")
async def list_categories(service: CatalogService = Depends(catalog_service_dp)):
    return await service.admin_categories()


@router.post("/categories", response_model=CategoryResponse, status_code=201, summary="Kategoriya yaratish")
async def create_category(payload: CategoryIn, service: CatalogService = Depends(catalog_service_dp)):
    return await service.create_category(payload)


@router.put("/categories/{category_id}", response_model=CategoryResponse, summary="Kategoriyani yangilash")
async def update_category(
    category_id: int, payload: CategoryUpdate, service: CatalogService = Depends(catalog_service_dp)
):
    return await service.update_category(category_id, payload)


@router.delete("/categories/{category_id}", status_code=204, summary="Kategoriyani o'chirish")
async def delete_category(category_id: int, service: CatalogService = Depends(catalog_service_dp)):
    await service.delete_category(category_id)
    return Response(status_code=204)


# ---------- Mahsulotlar ----------

@router.get("/products", response_model=OffsetPage[ProductResponse], summary="Barcha mahsulotlar")
async def list_products(
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    is_active: bool | None = None,
    page: PageQuery = Depends(),
    service: CatalogService = Depends(catalog_service_dp),
):
    return await service.admin_products(page, category_id=category_id, q=q, is_active=is_active)


@router.post("/products", response_model=ProductResponse, status_code=201, summary="Mahsulot yaratish")
async def create_product(payload: ProductIn, service: CatalogService = Depends(catalog_service_dp)):
    return await service.create_product(payload)


@router.get("/products/{product_id}", response_model=ProductResponse, summary="Mahsulot tafsiloti")
async def get_product(product_id: int, service: CatalogService = Depends(catalog_service_dp)):
    return await service.admin_product(product_id)


@router.put("/products/{product_id}", response_model=ProductResponse, summary="Mahsulotni yangilash")
async def update_product(
    product_id: int, payload: ProductUpdate, service: CatalogService = Depends(catalog_service_dp)
):
    return await service.update_product(product_id, payload)


@router.delete("/products/{product_id}", status_code=204, summary="Mahsulotni o'chirish")
async def delete_product(product_id: int, service: CatalogService = Depends(catalog_service_dp)):
    await service.delete_product(product_id)
    return Response(status_code=204)


@router.post("/uploads/image", summary="Mahsulot rasmini yuklash")
async def upload_image(file: UploadFile):
    return {"url": await uploads.save_product_image(file)}


# ---------- Buyurtmalar ----------

@router.get("/orders", response_model=OffsetPage[OrderResponse], summary="Barcha buyurtmalar")
async def list_orders(
    status: OrderStatus | None = None,
    q: str | None = Query(default=None, max_length=100),
    diller_id: int | None = None,
    shop_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: PageQuery = Depends(),
    service: OrderService = Depends(order_service_dp),
):
    return await service.list_for_staff(
        page, diller_id=diller_id, shop_id=shop_id, status_filter=status, q=q, date_from=date_from, date_to=date_to,
    )


@router.get("/orders/{order_id}", response_model=OrderResponse, summary="Buyurtma tafsiloti")
async def get_order(order_id: int, service: OrderService = Depends(order_service_dp)):
    return await service.get_for_staff(order_id)


@router.post("/orders/{order_id}/status", response_model=OrderResponse, summary="Buyurtma holatini o'zgartirish")
async def change_order_status(
    order_id: int,
    payload: AdminStatusChange,
    bg: BackgroundTasks,
    service: OrderService = Depends(order_service_dp),
):
    return await service.staff_transition(
        order_id, payload.status, actor=CancelledBy.SUPERADMIN, diller_id=None, reason=payload.reason, bg=bg
    )
