"""Superadmin operatsiyalari: dillerlar, mijozlar (do'konlar) va ularni boshqarish."""
from html import escape

from fastapi import BackgroundTasks, HTTPException, status

from app.auth.services import get_password_hash
from app.core.base import BaseService
from app.models.shop import DillerProfile
from app.models.user import User
from app.repositories.order import OrderRepository
from app.repositories.shop import ShopRepository
from app.schemas.common import PageQuery, make_page
from app.schemas.shop import AdminUserUpdate, DillerCreate, DillerUpdate
from app.schemas.user import UserRole
from app.services import notify
from app.services.shop import diller_name, shop_out


def diller_admin_out(user: User, shops_count: int = 0, orders_count: int = 0) -> dict:
    profile = user.profile
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "phone": user.phone,
        "telegram_id": user.telegram_id,
        "company_name": profile.company_name if profile else None,
        "region": profile.region if profile else None,
        "work_hours": profile.work_hours if profile else None,
        "is_blocked": user.is_blocked,
        "shops_count": shops_count,
        "orders_count": orders_count,
        "created_at": user.created_at,
    }


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


class AdminService(BaseService[ShopRepository]):
    def __init__(self, repository: ShopRepository):
        super().__init__(repository)
        self.orders = OrderRepository(repository.session)

    # ---------- Dillerlar ----------

    async def list_dillers(self, page: PageQuery, q: str | None, blocked: bool | None) -> dict:
        rows, total = await self.repository.list_dillers_admin(
            q=q, blocked=blocked, offset=page.offset, limit=page.size
        )
        return make_page([diller_admin_out(*row) for row in rows], total, page)

    async def _diller(self, diller_id: int) -> User:
        diller = await self.repository.get_diller(diller_id)
        if diller is None:
            raise HTTPException(status_code=404, detail="Diller topilmadi")
        return diller

    async def get_diller(self, diller_id: int) -> dict:
        diller = await self._diller(diller_id)
        shops, orders = await self.repository.diller_counts(diller_id)
        return diller_admin_out(diller, shops, orders)

    async def create_diller(self, payload: DillerCreate) -> dict:
        if await self.repository.username_exists(payload.username):
            raise _conflict("Bunday login (username) band")
        if payload.telegram_id and await self.repository.telegram_id_taken(payload.telegram_id):
            raise _conflict("Bu Telegram ID boshqa foydalanuvchiga biriktirilgan")

        user = User(
            username=payload.username,
            email=None,
            password_hash=get_password_hash(payload.password),
            role=UserRole.DILLER,
            full_name=payload.full_name,
            phone=payload.phone,
            telegram_id=payload.telegram_id,
        )
        user.profile = DillerProfile(
            company_name=payload.company_name, phone=payload.phone,
            region=payload.region, work_hours=payload.work_hours,
        )
        self.repository.session.add(user)
        await self.repository.commit()
        return await self.get_diller(user.id)

    async def update_diller(self, diller_id: int, payload: DillerUpdate) -> dict:
        diller = await self._diller(diller_id)
        fields = payload.model_fields_set

        if "telegram_id" in fields:
            if payload.telegram_id and await self.repository.telegram_id_taken(
                payload.telegram_id, exclude_user_id=diller_id
            ):
                raise _conflict("Bu Telegram ID boshqa foydalanuvchiga biriktirilgan")
            diller.telegram_id = payload.telegram_id

        if payload.full_name:
            diller.full_name = payload.full_name
        if "phone" in fields:
            diller.phone = payload.phone
        if payload.password:
            diller.password_hash = get_password_hash(payload.password)
            diller.refresh_token = None  # eski sessiyalar bekor qilinadi

        if diller.profile is None:
            diller.profile = DillerProfile()
        for key in ("company_name", "region", "work_hours"):
            if key in fields:
                setattr(diller.profile, key, getattr(payload, key))
        if "phone" in fields:
            diller.profile.phone = payload.phone

        await self.repository.commit()
        self.repository.session.expire_all()
        return await self.get_diller(diller_id)

    async def set_diller_blocked(self, diller_id: int, blocked: bool) -> dict:
        diller = await self._diller(diller_id)
        diller.is_blocked = blocked
        if blocked:
            diller.refresh_token = None
        await self.repository.commit()
        return await self.get_diller(diller_id)

    # ---------- Mijozlar / do'konlar ----------

    async def _client_out(self, shop) -> dict:
        owner = shop.owner
        orders_count, total_spent, _ = await self.repository.shop_stats(shop.id)
        return {
            "id": owner.id,
            "username": owner.username,
            "full_name": owner.full_name,
            "phone": owner.phone,
            "telegram_id": owner.telegram_id,
            "is_blocked": owner.is_blocked,
            "created_at": owner.created_at,
            "shop": shop_out(shop),
            "orders_count": orders_count,
            "total_spent": int(total_spent or 0),
        }

    async def list_users(
        self, page: PageQuery, *, q: str | None, diller_id: int | None, blocked: bool | None
    ) -> dict:
        rows, total = await self.repository.list_clients(
            diller_id=diller_id, q=q, blocked=blocked, offset=page.offset, limit=page.size
        )
        items = []
        for shop, orders_count, total_spent, _last in rows:
            owner = shop.owner
            items.append({
                "id": owner.id, "username": owner.username, "full_name": owner.full_name, "phone": owner.phone,
                "telegram_id": owner.telegram_id, "is_blocked": owner.is_blocked, "created_at": owner.created_at,
                "shop": shop_out(shop), "orders_count": orders_count, "total_spent": int(total_spent or 0),
            })
        return make_page(items, total, page)

    async def _shop_of_user(self, user_id: int):
        shop = await self.repository.get_shop_by_owner(user_id)
        if shop is None or shop.owner is None or shop.owner.is_deleted:
            raise HTTPException(status_code=404, detail="Mijoz topilmadi")
        return shop

    async def get_user(self, user_id: int) -> dict:
        return await self._client_out(await self._shop_of_user(user_id))

    async def update_user(self, user_id: int, payload: AdminUserUpdate) -> dict:
        shop = await self._shop_of_user(user_id)
        owner = shop.owner
        fields = payload.model_fields_set

        if payload.full_name:
            owner.full_name = payload.full_name
        if "phone" in fields:
            owner.phone = payload.phone
        if payload.shop_name:
            shop.name = payload.shop_name
        if "shop_phone" in fields:
            shop.phone = payload.shop_phone
        if "address" in fields:
            shop.address = payload.address
        if "latitude" in fields:
            shop.latitude = payload.latitude
        if "longitude" in fields:
            shop.longitude = payload.longitude

        await self.repository.commit()
        self.repository.session.expire_all()
        return await self.get_user(user_id)

    async def set_user_blocked(self, user_id: int, blocked: bool) -> dict:
        shop = await self._shop_of_user(user_id)
        shop.owner.is_blocked = blocked
        if blocked:
            shop.owner.refresh_token = None
        await self.repository.commit()
        self.repository.session.expire_all()
        return await self.get_user(user_id)

    async def reassign_user(self, user_id: int, diller_id: int, bg: BackgroundTasks) -> dict:
        """Do'konni boshqa dillerga o'tkazadi. Ochiq buyurtmalar ham yangi dillerga o'tadi."""
        shop = await self._shop_of_user(user_id)
        diller = await self.repository.get_diller(diller_id, only_active=True)
        if diller is None:
            raise HTTPException(status_code=422, detail="Diller topilmadi yoki bloklangan")
        if shop.diller_id == diller_id:
            raise _conflict("Mijoz allaqachon shu dillerga biriktirilgan")

        shop.diller_id = diller_id
        moved = await self.orders.move_open_orders(shop.id, diller_id)

        # Xabar matnlari expire_all() dan OLDIN tayyorlanadi: keyin obyekt atributlari
        # yopiladi va async kontekstda ularni qayta yuklab bo'lmaydi
        client_chat_id = shop.owner.telegram_id
        client_text = notify.reassigned_for_client(diller_name(diller))
        diller_chat_id = diller.telegram_id
        diller_text = (
            f"ℹ️ Sizga yangi mijoz biriktirildi: <b>{escape(shop.name)}</b>. Ochiq buyurtmalar: {moved} ta."
        )

        await self.repository.commit()
        # Do'konning eski `diller` bog'lanishi keshda qolmasligi uchun
        self.repository.session.expire_all()

        if client_chat_id:
            bg.add_task(notify.send_telegram_message, client_chat_id, client_text)
        if moved and diller_chat_id:
            bg.add_task(notify.send_telegram_message, diller_chat_id, diller_text)
        return await self.get_user(user_id)
