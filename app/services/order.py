from datetime import date, datetime, timezone

from fastapi import BackgroundTasks, HTTPException, status

from app.core.base import BaseService
from app.models.order import Order, OrderItem
from app.repositories.catalog import CatalogRepository
from app.repositories.order import OrderRepository
from app.repositories.shop import ShopRepository
from app.schemas.common import PageQuery, make_page
from app.schemas.order import (
    ALLOWED_TRANSITIONS,
    MAX_QUANTITY,
    CancelledBy,
    OrderCreate,
    OrderItemIn,
    OrderStatus,
    OrderUpdate,
)
from app.services import notify
from app.services.shop import diller_name


def order_out(order: Order, *, for_client: bool = False) -> dict:
    editable = for_client and order.status == OrderStatus.PENDING
    return {
        "id": order.id,
        "status": order.status,
        "shop_id": order.shop_id,
        "shop_name": order.shop.name if order.shop else None,
        "diller_id": order.diller_id,
        "diller_name": diller_name(order.diller) if order.diller else None,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "delivery_address": order.delivery_address,
        "latitude": order.latitude,
        "longitude": order.longitude,
        "note": order.note,
        "total_amount": order.total_amount,
        "items_count": len(order.items),
        "reject_reason": order.reject_reason,
        "cancelled_by": order.cancelled_by,
        "items": [
            {
                "id": i.id, "product_id": i.product_id, "product_name": i.product_name, "unit": i.unit,
                "unit_price": i.unit_price, "quantity": i.quantity, "line_total": i.line_total,
            }
            for i in order.items
        ],
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "confirmed_at": order.confirmed_at,
        "delivered_at": order.delivered_at,
        "cancelled_at": order.cancelled_at,
        "can_edit": editable,
        "can_cancel": editable,
    }


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi")


class OrderService(BaseService[OrderRepository]):
    def __init__(self, repository: OrderRepository):
        super().__init__(repository)
        self.shops = ShopRepository(repository.session)
        self.catalog = CatalogRepository(repository.session)

    # ---------- Yordamchilar ----------

    async def _build_items(self, items: list[OrderItemIn]) -> tuple[list[OrderItem], int]:
        """Mahsulotlarni tekshiradi va narxni SERVERDA hisoblaydi (klient narxi ishonchsiz)."""
        quantities: dict[int, int] = {}
        for item in items:
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity

        products = await self.catalog.get_available_products(list(quantities))

        missing = [pid for pid in quantities if pid not in products]
        if missing:
            raise HTTPException(
                status_code=422,
                detail="Ba'zi mahsulotlar mavjud emas yoki sotuvdan olingan. Savatni yangilang.",
            )

        order_items: list[OrderItem] = []
        total = 0
        for product_id, quantity in quantities.items():
            product = products[product_id]
            if quantity > MAX_QUANTITY:
                raise HTTPException(status_code=422, detail=f"'{product.name}' miqdori juda katta")
            if quantity < product.min_quantity:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{product.name}' uchun minimal miqdor: {product.min_quantity} {product.unit}",
                )
            line_total = product.price * quantity
            total += line_total
            order_items.append(OrderItem(
                product_id=product.id, product_name=product.name, unit=product.unit,
                unit_price=product.price, quantity=quantity, line_total=line_total,
            ))
        return order_items, total

    def _apply_transition(
        self, order: Order, target: OrderStatus, *, actor: CancelledBy, reason: str | None = None
    ) -> None:
        if target not in ALLOWED_TRANSITIONS[order.status]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Buyurtma holatini '{order.status.value}' dan '{target.value}' ga o'zgartirib bo'lmaydi",
            )
        now = datetime.now(timezone.utc)
        order.status = target
        if target == OrderStatus.CONFIRMED:
            order.confirmed_at = now
        elif target == OrderStatus.DELIVERED:
            order.delivered_at = now
        elif target == OrderStatus.CANCELLED:
            order.cancelled_at = now
            order.cancelled_by = actor
            order.reject_reason = (reason or "").strip() or None

    def _notify(self, bg: BackgroundTasks, chat_id: int | None, text: str) -> None:
        if chat_id:
            bg.add_task(notify.send_telegram_message, chat_id, text)

    async def _notify_client(self, bg: BackgroundTasks, order: Order) -> None:
        client = await self.shops.get_user(order.user_id) if order.user_id else None
        if client is not None:
            self._notify(bg, client.telegram_id, notify.status_for_client(order))

    # ---------- Mijoz ----------

    async def create(self, user: dict, payload: OrderCreate, bg: BackgroundTasks) -> dict:
        shop = await self.shops.get_shop_by_owner(user["id"])
        if shop is None:
            raise HTTPException(status_code=409, detail="Avval do'kon ma'lumotlarini to'ldiring")

        diller = await self.shops.get_diller(shop.diller_id, only_active=True) if shop.diller_id else None
        if diller is None:
            raise HTTPException(
                status_code=409,
                detail="Sizga faol diller biriktirilmagan. Administrator bilan bog'laning",
            )

        items, total = await self._build_items(payload.items)
        owner = shop.owner

        order = Order(
            shop_id=shop.id,
            user_id=user["id"],
            diller_id=diller.id,
            status=OrderStatus.PENDING,
            customer_name=(owner.full_name if owner else None) or shop.name,
            customer_phone=shop.phone or (owner.phone if owner else None),
            delivery_address=payload.delivery_address or shop.address,
            latitude=payload.latitude if payload.latitude is not None else shop.latitude,
            longitude=payload.longitude if payload.longitude is not None else shop.longitude,
            note=(payload.note or "").strip() or None,
            total_amount=total,
            items=items,
        )
        self.repository.add(order)
        await self.repository.commit()

        order = await self.repository.get(order.id)
        self._notify(bg, diller.telegram_id, notify.new_order_for_diller(order))
        return order_out(order, for_client=True)

    async def list_for_client(
        self, user_id: int, page: PageQuery, status_filter: OrderStatus | None
    ) -> dict:
        query = self.repository.query(user_id=user_id, status=status_filter)
        orders, total = await self.repository.paginate(query, page.offset, page.size)
        return make_page([order_out(o, for_client=True) for o in orders], total, page)

    async def _own_order(self, user_id: int, order_id: int, *, for_update: bool = False) -> Order:
        order = await self.repository.get(order_id, for_update=for_update)
        # Boshqa mijozning buyurtmasi mavjudligi ham oshkor bo'lmasligi uchun 404 qaytariladi
        if order is None or order.user_id != user_id:
            raise _not_found()
        return order

    async def get_for_client(self, user_id: int, order_id: int) -> dict:
        return order_out(await self._own_order(user_id, order_id), for_client=True)

    async def update_for_client(self, user_id: int, order_id: int, payload: OrderUpdate, bg: BackgroundTasks) -> dict:
        order = await self._own_order(user_id, order_id, for_update=True)
        if order.status != OrderStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Buyurtma qabul qilingan yoki yopilgan, uni endi tahrirlab bo'lmaydi",
            )

        items, total = await self._build_items(payload.items)
        order.items = items
        order.total_amount = total
        if payload.note is not None:
            order.note = payload.note.strip() or None
        if payload.delivery_address:
            order.delivery_address = payload.delivery_address
        if payload.latitude is not None and payload.longitude is not None:
            order.latitude, order.longitude = payload.latitude, payload.longitude
        await self.repository.commit()

        order = await self.repository.get(order_id)
        diller = order.diller
        if diller is not None:
            self._notify(bg, diller.telegram_id, notify.updated_order_for_diller(order))
        return order_out(order, for_client=True)

    async def cancel_for_client(self, user_id: int, order_id: int, bg: BackgroundTasks) -> dict:
        order = await self._own_order(user_id, order_id, for_update=True)
        if order.status != OrderStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Buyurtma qabul qilingan yoki yopilgan, uni endi bekor qilib bo'lmaydi. Dilleringiz bilan bog'laning",
            )
        self._apply_transition(order, OrderStatus.CANCELLED, actor=CancelledBy.CLIENT)
        await self.repository.commit()

        order = await self.repository.get(order_id)
        if order.diller is not None:
            self._notify(bg, order.diller.telegram_id, notify.cancelled_by_client_for_diller(order))
        return order_out(order, for_client=True)

    # ---------- Diller ----------

    async def list_for_staff(
        self,
        page: PageQuery,
        *,
        diller_id: int | None,
        shop_id: int | None,
        status_filter: OrderStatus | None,
        q: str | None,
        date_from: date | None,
        date_to: date | None,
    ) -> dict:
        query = self.repository.query(
            diller_id=diller_id, shop_id=shop_id, status=status_filter, q=q, date_from=date_from, date_to=date_to
        )
        orders, total = await self.repository.paginate(query, page.offset, page.size)
        return make_page([order_out(o) for o in orders], total, page)

    async def get_for_staff(self, order_id: int, *, diller_id: int | None = None) -> dict:
        order = await self.repository.get(order_id)
        if order is None or (diller_id is not None and order.diller_id != diller_id):
            raise _not_found()
        return order_out(order)

    async def staff_transition(
        self,
        order_id: int,
        target: OrderStatus,
        *,
        actor: CancelledBy,
        diller_id: int | None,
        reason: str | None,
        bg: BackgroundTasks,
    ) -> dict:
        order = await self.repository.get(order_id, for_update=True)
        # Diller faqat o'ziga tegishli buyurtmani boshqaradi
        if order is None or (diller_id is not None and order.diller_id != diller_id):
            raise _not_found()

        self._apply_transition(order, target, actor=actor, reason=reason)
        await self.repository.commit()

        order = await self.repository.get(order_id)
        await self._notify_client(bg, order)
        return order_out(order)
