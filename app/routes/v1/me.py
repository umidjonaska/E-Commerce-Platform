from fastapi import APIRouter, Depends

from app.auth.services import get_current_client_user, get_current_user
from app.deps import shop_service_dp
from app.schemas.shop import DillerPublic, MeResponse, ShopRegister, ShopUpdate
from app.services.shop import ShopService

router = APIRouter()


@router.get("/me", response_model=MeResponse, summary="Joriy foydalanuvchi va uning do'koni/dilleri")
async def me(
    current_user: dict = Depends(get_current_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.me(current_user["id"])


@router.get("/dillers", response_model=list[DillerPublic], summary="Ro'yxatdan o'tish uchun faol dillerlar")
async def list_dillers(
    current_user: dict = Depends(get_current_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.public_dillers()


@router.post("/me/shop", response_model=MeResponse, status_code=201, summary="Ro'yxatdan o'tish: do'kon yaratish")
async def register_shop(
    payload: ShopRegister,
    current_user: dict = Depends(get_current_client_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.register(current_user["id"], payload)


@router.put("/me/shop", response_model=MeResponse, summary="Do'kon ma'lumotlarini yangilash")
async def update_shop(
    payload: ShopUpdate,
    current_user: dict = Depends(get_current_client_user),
    service: ShopService = Depends(shop_service_dp),
):
    return await service.update_shop(current_user["id"], payload)
