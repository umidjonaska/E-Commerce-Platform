from fastapi import HTTPException, status

from app.core.base import BaseService
from app.models.shop import Shop
from app.models.user import User
from app.repositories.shop import ShopRepository
from app.schemas.common import PageQuery, make_page
from app.schemas.shop import ShopRegister, ShopUpdate
from app.schemas.user import UserRole


def diller_name(user: User) -> str:
    profile = user.profile
    return (profile.company_name if profile and profile.company_name else None) or user.full_name or user.username


def diller_public(user: User) -> dict:
    profile = user.profile
    return {
        "id": user.id,
        "name": diller_name(user),
        "company_name": profile.company_name if profile else None,
        "phone": (profile.phone if profile and profile.phone else None) or user.phone,
        "region": profile.region if profile else None,
        "work_hours": profile.work_hours if profile else None,
    }


def shop_out(shop: Shop | None) -> dict | None:
    if shop is None:
        return None
    return {
        "id": shop.id,
        "name": shop.name,
        "phone": shop.phone,
        "address": shop.address,
        "latitude": shop.latitude,
        "longitude": shop.longitude,
        "diller": diller_public(shop.diller) if shop.diller and not shop.diller.is_deleted else None,
    }


def me_user_out(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "phone": user.phone,
        "telegram_id": user.telegram_id,
    }


def client_out(shop: Shop, orders_count: int, total_spent: int, last_order_at) -> dict:
    owner = shop.owner
    return {
        "shop_id": shop.id,
        "shop_name": shop.name,
        "owner_name": (owner.full_name or owner.username) if owner else None,
        "phone": shop.phone or (owner.phone if owner else None),
        "address": shop.address,
        "latitude": shop.latitude,
        "longitude": shop.longitude,
        "orders_count": orders_count,
        "total_spent": int(total_spent or 0),
        "last_order_at": last_order_at,
        "joined_at": shop.created_at,
    }


class ShopService(BaseService[ShopRepository]):
    async def me(self, user_id: int) -> dict:
        user = await self.repository.get_user(user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        shop = await self.repository.get_shop_by_owner(user_id)
        return {"user": me_user_out(user), "shop": shop_out(shop)}

    async def public_dillers(self) -> list[dict]:
        return [diller_public(u) for u in await self.repository.list_public_dillers()]

    async def register(self, user_id: int, payload: ShopRegister) -> dict:
        """Mijoz ro'yxatdan o'tishi: do'kon yaratiladi va dillerga biriktiriladi."""
        user = await self.repository.get_user(user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")

        if await self.repository.get_shop_by_owner(user_id) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Siz allaqachon ro'yxatdan o'tgansiz")

        diller = await self.repository.get_diller(payload.diller_id, only_active=True)
        if diller is None:
            raise HTTPException(status_code=422, detail="Tanlangan diller topilmadi yoki faol emas")

        user.full_name = payload.full_name
        user.phone = payload.phone
        await self.repository.create_shop({
            "owner_id": user_id,
            "diller_id": diller.id,
            "name": payload.name,
            "phone": payload.phone,
            "address": payload.address,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        })
        await self.repository.commit()
        return await self.me(user_id)

    async def update_shop(self, user_id: int, payload: ShopUpdate) -> dict:
        """Mijoz o'z do'kon ma'lumotini yangilaydi. Dillerni faqat superadmin o'zgartira oladi."""
        user = await self.repository.get_user(user_id)
        shop = await self.repository.get_shop_by_owner(user_id)
        if user is None or shop is None:
            raise HTTPException(status_code=404, detail="Do'kon topilmadi")

        shop.name = payload.name
        shop.phone = payload.phone
        shop.address = payload.address
        shop.latitude = payload.latitude
        shop.longitude = payload.longitude
        if payload.full_name:
            user.full_name = payload.full_name
        user.phone = payload.phone
        await self.repository.commit()
        return await self.me(user_id)

    # ---------- Diller: mijozlar ----------

    async def diller_clients(self, diller_id: int, page: PageQuery, q: str | None) -> dict:
        rows, total = await self.repository.list_clients(
            diller_id=diller_id, q=q, blocked=None, offset=page.offset, limit=page.size
        )
        return make_page([client_out(*row) for row in rows], total, page)

    async def diller_client(self, diller_id: int, shop_id: int) -> dict:
        shop = await self.repository.get_shop(shop_id)
        if shop is None or shop.diller_id != diller_id:
            raise HTTPException(status_code=404, detail="Mijoz topilmadi")
        orders_count, total_spent, last_order = await self.repository.shop_stats(shop_id)
        return client_out(shop, orders_count, total_spent, last_order)


def ensure_client_role(user: dict) -> None:
    if UserRole(user["role"]) != UserRole.USER:
        raise HTTPException(status_code=403, detail="Faqat mijoz (do'kon) uchun ruxsat")
