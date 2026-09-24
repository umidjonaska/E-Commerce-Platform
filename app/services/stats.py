from datetime import date, timedelta

from sqlalchemy import and_, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem
from app.models.shop import DillerProfile, Shop
from app.models.user import User
from app.schemas.order import OrderStatus
from app.utils.timeutil import TZ_NAME, range_bounds

TOP_LIMIT = 5


def _local_day(column):
    # TZ_NAME quyidagi modulda qat'iy regex bilan tekshirilgan (SQL injection'dan xoli)
    return func.date(func.timezone(literal_column(f"'{TZ_NAME}'"), column))


async def build_stats(
    session: AsyncSession,
    date_from: date,
    date_to: date,
    *,
    diller_id: int | None = None,
    with_dillers: bool = False,
) -> dict:
    start, end = range_bounds(date_from, date_to)

    live = [Order.is_deleted == False]  # noqa: E712
    if diller_id is not None:
        live.append(Order.diller_id == diller_id)

    created_in = (Order.created_at >= start, Order.created_at < end)
    delivered_in = (Order.status == OrderStatus.DELIVERED, Order.delivered_at >= start, Order.delivered_at < end)
    cancelled_in = (Order.status == OrderStatus.CANCELLED, Order.cancelled_at >= start, Order.cancelled_at < end)

    def count_where(*conditions):
        return func.count(Order.id).filter(and_(*conditions))

    totals_row = (await session.execute(
        select(
            count_where(*created_in).label("orders_count"),
            count_where(*delivered_in).label("delivered_count"),
            func.coalesce(func.sum(Order.total_amount).filter(and_(*delivered_in)), 0).label("sales_amount"),
            count_where(*cancelled_in).label("cancelled_count"),
            count_where(Order.status == OrderStatus.PENDING).label("pending_now"),
            count_where(Order.status == OrderStatus.CONFIRMED).label("confirmed_now"),
        ).where(*live)
    )).one()

    shops_query = select(func.count(Shop.id))
    if diller_id is not None:
        shops_query = shops_query.where(Shop.diller_id == diller_id)
    clients_count = (await session.execute(shops_query)).scalar_one()

    delivered_count = totals_row.delivered_count
    sales_amount = int(totals_row.sales_amount)
    totals = {
        "orders_count": totals_row.orders_count,
        "delivered_count": delivered_count,
        "sales_amount": sales_amount,
        "average_order": round(sales_amount / delivered_count) if delivered_count else 0,
        "cancelled_count": totals_row.cancelled_count,
        "pending_now": totals_row.pending_now,
        "confirmed_now": totals_row.confirmed_now,
        "clients_count": clients_count,
    }

    # ---- Kunlik qator (mahalliy vaqt zonasi bo'yicha) ----
    created_day = _local_day(Order.created_at)
    created_rows = (await session.execute(
        select(created_day.label("day"), func.count(Order.id))
        .where(*live, *created_in).group_by(created_day)
    )).all()

    delivered_day = _local_day(Order.delivered_at)
    delivered_rows = (await session.execute(
        select(delivered_day.label("day"), func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
        .where(*live, *delivered_in).group_by(delivered_day)
    )).all()

    orders_by_day = {row[0]: row[1] for row in created_rows}
    delivered_by_day = {row[0]: (row[1], int(row[2])) for row in delivered_rows}

    series = []
    day = date_from
    while day <= date_to:
        delivered, sales = delivered_by_day.get(day, (0, 0))
        series.append({"date": day, "orders": orders_by_day.get(day, 0), "delivered": delivered, "sales": sales})
        day += timedelta(days=1)

    # ---- Top mahsulotlar (yetkazilgan buyurtmalar bo'yicha) ----
    amount = func.coalesce(func.sum(OrderItem.line_total), 0)
    quantity = func.coalesce(func.sum(OrderItem.quantity), 0)
    top_rows = (await session.execute(
        select(OrderItem.product_name, quantity, amount)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*live, *delivered_in)
        .group_by(OrderItem.product_name)
        .order_by(amount.desc(), quantity.desc())
        .limit(TOP_LIMIT)
    )).all()
    top_products = [{"name": r[0], "quantity": int(r[1]), "amount": int(r[2])} for r in top_rows]

    result = {
        "date_from": date_from,
        "date_to": date_to,
        "totals": totals,
        "series": series,
        "top_products": top_products,
        "top_dillers": None,
    }

    if with_dillers:
        sales = func.coalesce(func.sum(Order.total_amount), 0)
        diller_rows = (await session.execute(
            select(Order.diller_id, func.count(Order.id), sales)
            .where(*live, *delivered_in, Order.diller_id.is_not(None))
            .group_by(Order.diller_id)
            .order_by(sales.desc())
            .limit(TOP_LIMIT)
        )).all()

        names: dict[int, str] = {}
        if diller_rows:
            users = (await session.execute(
                select(User).where(User.id.in_([r[0] for r in diller_rows]))
            )).unique().scalars().all()
            for user in users:
                profile: DillerProfile | None = user.profile
                names[user.id] = (profile.company_name if profile and profile.company_name else None) \
                    or user.full_name or user.username

        result["top_dillers"] = [
            {"diller_id": r[0], "name": names.get(r[0], f"#{r[0]}"), "delivered_count": r[1], "sales_amount": int(r[2])}
            for r in diller_rows
        ]

    return result
