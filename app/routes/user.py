from fastapi import APIRouter, Depends, HTTPException, status

from app.utils.pagination import Page, PageParams, get_page_params
from app.deps import user_service_dp
from app.auth.services import get_current_user, get_current_superadmin_user

from app.services.user import UserService
from app.schemas.user import UserResponse, UserCreate, UserSelfUpdate, UserRole

router = APIRouter()


@router.get("/users/", response_model=Page[UserResponse], summary="Barcha userlar ma'lumoti (faqat superadmin)")
async def router_get_all(
    page_params: PageParams = Depends(get_page_params),
    _service: UserService = Depends(user_service_dp),
    current_superadmin: dict = Depends(get_current_superadmin_user),
):
    return await _service.get_all_user(page_params)


@router.get("/users/{user_id}/", response_model=UserResponse, summary="Aniq user ma'lumoti (o'zi yoki superadmin)")
async def router_get_one(
    user_id: int,
    _service: UserService = Depends(user_service_dp),
    current_user: dict = Depends(get_current_user),
):
    if user_id != current_user["id"] and current_user["role"] != UserRole.SUPERADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruxsat yo'q")

    user = await _service.get_one_user(user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.post("/users/", summary="Yangi user qo'shish", status_code=201)
async def router_create(
    payload: UserCreate,
    _service: UserService = Depends(user_service_dp),
):
    # xavfsizlik: client role/telegram_id tanlay olmaydi
    payload.role = UserRole.USER
    payload.telegram_id = None
    return await _service.create_user(payload)


@router.post(
    "/users/admin",
    response_model=UserResponse,
    status_code=201,
    summary="Admin, diller yoki superadmin yaratish (faqat superadmin)",
)
async def router_create_admin(
    payload: UserCreate,
    _service: UserService = Depends(user_service_dp),
    current_superadmin: dict = Depends(get_current_superadmin_user),
):
    if payload.role not in (UserRole.ADMIN, UserRole.DILLER, UserRole.SUPERADMIN):
        raise HTTPException(
            status_code=422,
            detail="role faqat 'admin', 'diller' yoki 'superadmin' bo'lishi mumkin",
        )
    return await _service.create_admin_user(payload)


@router.put("/users/", response_model=UserResponse, summary="Joriy user ma'lumotlarini yangilash")
async def router_update(
    payload: UserSelfUpdate,
    _service: UserService = Depends(user_service_dp),
    current_user: dict = Depends(get_current_user),
):
    return await _service.update_user(current_user["id"], payload)


@router.delete("/users/{user_id}", summary="ID bo'yicha userni o'chirish (faqat superadmin)")
async def router_delete(
    user_id: int,
    _service: UserService = Depends(user_service_dp),
    current_superadmin: dict = Depends(get_current_superadmin_user),
):
    return await _service.delete_user(user_id)
