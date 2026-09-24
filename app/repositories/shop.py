from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import contains_eager

from app.core.base import BaseRepository
from app.models.order import Order
from app.models.shop import DillerProfile, Shop
from app.models.user import User
from app.schemas.order import OrderStatus
from app.schemas.user import UserRole


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _order_stats_columns(shop_col):
    """Do'kon bo'yicha: buyurtmalar soni, yetkazilgan summa, oxirgi buyurtma vaqti."""
    live = (Order.shop_id == shop_col, Order.is_deleted == False)  # noqa: E712
    orders_count = select(func.count(Order.id)).where(*live).correlate(Shop).scalar_subquery()
    total_spent = (
        select(func.coalesce(func.sum(Order.total_amount), 0))
        .where(*live, Order.status == OrderStatus.DELIVERED)
        .correlate(Shop)
        .scalar_subquery()
    )
    last_order = select(func.max(Order.created_at)).where(*live).correlate(Shop).scalar_subquery()
    return orders_count, total_spent, last_order


class ShopRepository(BaseRepository):
    # ---------- Shops ----------

    async def get_shop_by_owner(self, owner_id: int) -> Shop | None:
        query = select(Shop).where(Shop.owner_id == owner_id)
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def get_shop(self, shop_id: int) -> Shop | None:
        query = select(Shop).where(Shop.id == shop_id)
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def create_shop(self, data: dict) -> Shop:
        shop = Shop(**data)
        self.session.add(shop)
        await self.session.flush()
        return shop

    async def commit(self) -> None:
        await self.session.commit()

    async def reload_shop(self, shop_id: int) -> Shop:
        self.session.expire_all()
        return await self.get_shop(shop_id)  # type: ignore[return-value]

    # ---------- Users ----------

    async def get_user(self, user_id: int) -> User | None:
        query = select(User).where(User.id == user_id, User.is_deleted == False)  # noqa: E712
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def get_user_by_telegram_id(self, telegram_id: int) -> User | None:
        query = select(User).where(User.telegram_id == telegram_id, User.is_deleted == False)  # noqa: E712
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def username_exists(self, username: str) -> bool:
        query = select(User.id).where(func.lower(User.username) == username.lower())
        return (await self.session.execute(query.limit(1))).first() is not None

    async def telegram_id_taken(self, telegram_id: int, *, exclude_user_id: int | None = None) -> bool:
        query = select(User.id).where(User.telegram_id == telegram_id)
        if exclude_user_id is not None:
            query = query.where(User.id != exclude_user_id)
        return (await self.session.execute(query.limit(1))).first() is not None

    # ---------- Dillers ----------

    async def get_diller(self, diller_id: int, *, only_active: bool = False) -> User | None:
        query = select(User).where(
            User.id == diller_id, User.role == UserRole.DILLER, User.is_deleted == False  # noqa: E712
        )
        if only_active:
            query = query.where(User.is_blocked == False)  # noqa: E712
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def list_public_dillers(self) -> list[User]:
        query = (
            select(User)
            .outerjoin(DillerProfile, DillerProfile.user_id == User.id)
            .options(contains_eager(User.profile))
            .where(User.role == UserRole.DILLER, User.is_deleted == False, User.is_blocked == False)  # noqa: E712
            .order_by(func.coalesce(DillerProfile.company_name, User.full_name, User.username), User.id)
        )
        return list((await self.session.execute(query)).unique().scalars().all())

    async def list_dillers_admin(
        self, *, q: str | None, blocked: bool | None, offset: int, limit: int
    ) -> tuple[list[tuple[User, int, int]], int]:
        shops_count = (
            select(func.count(Shop.id)).where(Shop.diller_id == User.id).correlate(User).scalar_subquery()
        )
        orders_count = (
            select(func.count(Order.id))
            .where(Order.diller_id == User.id, Order.is_deleted == False)  # noqa: E712
            .correlate(User)
            .scalar_subquery()
        )

        conditions = [User.role == UserRole.DILLER, User.is_deleted == False]  # noqa: E712
        if blocked is not None:
            conditions.append(User.is_blocked == blocked)
        if q:
            pattern = _like(q.strip())
            conditions.append(or_(
                User.username.ilike(pattern, escape="\\"),
                User.full_name.ilike(pattern, escape="\\"),
                User.phone.ilike(pattern, escape="\\"),
                DillerProfile.company_name.ilike(pattern, escape="\\"),
                DillerProfile.region.ilike(pattern, escape="\\"),
            ))

        base = (
            select(User)
            .outerjoin(DillerProfile, DillerProfile.user_id == User.id)
            .where(and_(*conditions))
        )
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

        query = (
            select(User, shops_count, orders_count)
            .outerjoin(DillerProfile, DillerProfile.user_id == User.id)
            .options(contains_eager(User.profile))
            .where(and_(*conditions))
            .order_by(User.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await self.session.execute(query)).unique().all()
        return [(row[0], row[1], row[2]) for row in rows], total

    async def diller_counts(self, diller_id: int) -> tuple[int, int]:
        shops = (await self.session.execute(
            select(func.count(Shop.id)).where(Shop.diller_id == diller_id)
        )).scalar_one()
        orders = (await self.session.execute(
            select(func.count(Order.id)).where(Order.diller_id == diller_id, Order.is_deleted == False)  # noqa: E712
        )).scalar_one()
        return shops, orders

    # ---------- Clients (diller uchun) / Users (superadmin uchun) ----------

    async def list_clients(
        self, *, diller_id: int | None, q: str | None, blocked: bool | None, offset: int, limit: int
    ) -> tuple[list[tuple[Shop, int, int, object]], int]:
        orders_count, total_spent, last_order = _order_stats_columns(Shop.id)

        conditions = [User.is_deleted == False]  # noqa: E712
        if diller_id is not None:
            conditions.append(Shop.diller_id == diller_id)
        if blocked is not None:
            conditions.append(User.is_blocked == blocked)
        if q:
            pattern = _like(q.strip())
            conditions.append(or_(
                Shop.name.ilike(pattern, escape="\\"),
                Shop.phone.ilike(pattern, escape="\\"),
                Shop.address.ilike(pattern, escape="\\"),
                User.full_name.ilike(pattern, escape="\\"),
                User.username.ilike(pattern, escape="\\"),
                User.phone.ilike(pattern, escape="\\"),
            ))

        base = select(Shop).join(User, User.id == Shop.owner_id).where(and_(*conditions))
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

        query = (
            select(Shop, orders_count, total_spent, last_order)
            .join(User, User.id == Shop.owner_id)
            .where(and_(*conditions))
            .order_by(Shop.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await self.session.execute(query)).unique().all()
        return [(r[0], r[1], r[2], r[3]) for r in rows], total

    async def shop_stats(self, shop_id: int) -> tuple[int, int, object]:
        orders_count, total_spent, last_order = _order_stats_columns(Shop.id)
        query = select(orders_count, total_spent, last_order).where(Shop.id == shop_id)
        row = (await self.session.execute(query)).one()
        return row[0], row[1], row[2]

    async def list_unassigned_users_count(self) -> int:
        query = select(func.count(Shop.id)).where(Shop.diller_id.is_(None))
        return (await self.session.execute(query)).scalar_one()
