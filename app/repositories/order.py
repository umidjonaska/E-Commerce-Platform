from datetime import date

from sqlalchemy import false, func, or_, select
from sqlalchemy.sql import Select

from app.core.base import BaseRepository
from app.models.order import Order
from app.models.shop import Shop
from app.schemas.order import OrderStatus
from app.utils.timeutil import range_bounds

# orders.id - PostgreSQL integer (int4). Kattaroq son berilsa so'rov xato bilan tugaydi.
MAX_ORDER_ID = 2_147_483_647


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _as_order_id(text: str) -> int | None:
    return int(text) if text.isdigit() and int(text) <= MAX_ORDER_ID else None


class OrderRepository(BaseRepository):
    def query(
        self,
        *,
        user_id: int | None = None,
        diller_id: int | None = None,
        shop_id: int | None = None,
        status: OrderStatus | None = None,
        q: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Select:
        query = select(Order).where(Order.is_deleted == False)  # noqa: E712

        if user_id is not None:
            query = query.where(Order.user_id == user_id)
        if diller_id is not None:
            query = query.where(Order.diller_id == diller_id)
        if shop_id is not None:
            query = query.where(Order.shop_id == shop_id)
        if status is not None:
            query = query.where(Order.status == status)
        if date_from is not None:
            query = query.where(Order.created_at >= range_bounds(date_from, date_from)[0])
        if date_to is not None:
            query = query.where(Order.created_at < range_bounds(date_to, date_to)[1])
        if q:
            query = query.where(self._search_condition(q.strip()))

        return query.order_by(Order.created_at.desc(), Order.id.desc())

    @staticmethod
    def _search_condition(text: str):
        """'#123' - buyurtma raqami bo'yicha aniq qidiruv, aks holda mijoz/telefon/do'kon nomi."""
        if text.startswith("#"):
            order_id = _as_order_id(text[1:].strip())
            # Noto'g'ri raqam yozilsa hech narsa topilmasligi kerak
            return Order.id == order_id if order_id is not None else false()

        pattern = _like(text)
        conditions = [
            Order.customer_name.ilike(pattern, escape="\\"),
            Order.customer_phone.ilike(pattern, escape="\\"),
            Order.shop_id.in_(select(Shop.id).where(Shop.name.ilike(pattern, escape="\\"))),
        ]

        order_id = _as_order_id(text)
        if order_id is not None:
            # Raqam kiritilsa, buyurtma raqami ham tekshiriladi (indeksdan foydalangan holda)
            conditions.append(Order.id == order_id)

        return or_(*conditions)

    async def paginate(self, query: Select, offset: int, limit: int) -> tuple[list[Order], int]:
        total = (
            await self.session.execute(select(func.count()).select_from(query.order_by(None).subquery()))
        ).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).unique().scalars().all()
        return list(rows), total

    async def get(self, order_id: int, *, for_update: bool = False) -> Order | None:
        query = select(Order).where(Order.id == order_id, Order.is_deleted == False)  # noqa: E712
        if for_update:
            # Bir vaqtda ikki marta qabul qilish/bekor qilishning oldini oladi
            query = query.with_for_update(of=Order)
        # populate_existing: commit'dan keyin ham yangi holatni (relationship'lar bilan) o'qiydi
        query = query.execution_options(populate_existing=True)
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    def add(self, order: Order) -> None:
        self.session.add(order)

    async def flush(self) -> None:
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()

    async def move_open_orders(self, shop_id: int, new_diller_id: int) -> int:
        """Do'kon boshqa dillerga o'tganda ochiq (PENDING/CONFIRMED) buyurtmalar ham o'tadi."""
        query = select(Order).where(
            Order.shop_id == shop_id,
            Order.is_deleted == False,  # noqa: E712
            Order.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED]),
        )
        orders = (await self.session.execute(query)).unique().scalars().all()
        for order in orders:
            order.diller_id = new_diller_id
        return len(orders)
