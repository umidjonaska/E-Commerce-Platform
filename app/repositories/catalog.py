from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.sql import Select

from app.core.base import BaseRepository
from app.models.catalog import Category, Product


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class CatalogRepository(BaseRepository):
    # ---------- Categories ----------

    async def list_categories(self, *, only_active: bool) -> list[tuple[Category, int]]:
        """Kategoriyalar va ulardagi (mijozga ko'rinadigan yoki barcha) mahsulotlar soni."""
        product_filter = [Product.category_id == Category.id, Product.is_deleted == False]  # noqa: E712
        if only_active:
            product_filter.append(Product.is_active == True)  # noqa: E712

        count_sq = (
            select(func.count(Product.id)).where(and_(*product_filter)).correlate(Category).scalar_subquery()
        )
        query = select(Category, count_sq).where(Category.is_deleted == False)  # noqa: E712
        if only_active:
            query = query.where(Category.is_active == True)  # noqa: E712
        query = query.order_by(Category.sort_order, Category.name, Category.id)

        result = await self.session.execute(query)
        return [(row[0], row[1]) for row in result.all()]

    async def get_category(self, category_id: int, *, only_active: bool = False) -> Category | None:
        query = select(Category).where(Category.id == category_id, Category.is_deleted == False)  # noqa: E712
        if only_active:
            query = query.where(Category.is_active == True)  # noqa: E712
        return (await self.session.execute(query)).scalar_one_or_none()

    async def category_name_exists(self, name: str, *, exclude_id: int | None = None) -> bool:
        query = select(Category.id).where(
            func.lower(Category.name) == name.lower(), Category.is_deleted == False  # noqa: E712
        )
        if exclude_id is not None:
            query = query.where(Category.id != exclude_id)
        return (await self.session.execute(query.limit(1))).first() is not None

    async def count_products_in_category(self, category_id: int) -> int:
        query = select(func.count(Product.id)).where(
            Product.category_id == category_id, Product.is_deleted == False  # noqa: E712
        )
        return (await self.session.execute(query)).scalar_one()

    async def create_category(self, data: dict) -> Category:
        category = Category(**data)
        self.session.add(category)
        await self.session.commit()
        await self.session.refresh(category)
        return category

    async def update_category(self, category: Category, data: dict) -> Category:
        for key, value in data.items():
            setattr(category, key, value)
        await self.session.commit()
        await self.session.refresh(category)
        return category

    async def delete_category(self, category: Category) -> None:
        category.is_deleted = True
        category.deleted_at = datetime.now(timezone.utc)
        await self.session.commit()

    # ---------- Products ----------

    def products_query(
        self,
        *,
        only_available: bool,
        category_id: int | None = None,
        q: str | None = None,
        ids: list[int] | None = None,
        is_active: bool | None = None,
    ) -> Select:
        query = (
            select(Product)
            .join(Category, Category.id == Product.category_id)
            .where(Product.is_deleted == False, Category.is_deleted == False)  # noqa: E712
        )
        if only_available:
            # Mijoz faqat faol mahsulot + faol kategoriyani ko'radi
            query = query.where(Product.is_active == True, Category.is_active == True)  # noqa: E712
        if is_active is not None:
            query = query.where(Product.is_active == is_active)
        if category_id is not None:
            query = query.where(Product.category_id == category_id)
        if ids is not None:
            # Bo'sh ro'yxat "hech narsa" degani (aks holda butun katalog qaytib ketardi)
            query = query.where(Product.id.in_(ids))
        if q:
            pattern = _like(q.strip())
            query = query.where(or_(Product.name.ilike(pattern, escape="\\"),
                                    Product.description.ilike(pattern, escape="\\")))
        return query.order_by(Category.sort_order, Product.name, Product.id)

    async def paginate_products(self, query: Select, offset: int, limit: int) -> tuple[list[Product], int]:
        total = (
            await self.session.execute(select(func.count()).select_from(query.order_by(None).subquery()))
        ).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).unique().scalars().all()
        return list(rows), total

    async def get_product(self, product_id: int, *, only_available: bool = False) -> Product | None:
        query = (
            select(Product)
            .join(Category, Category.id == Product.category_id)
            .where(Product.id == product_id, Product.is_deleted == False, Category.is_deleted == False)  # noqa: E712
        )
        if only_available:
            query = query.where(Product.is_active == True, Category.is_active == True)  # noqa: E712
        return (await self.session.execute(query)).unique().scalar_one_or_none()

    async def get_available_products(self, ids: list[int]) -> dict[int, Product]:
        query = self.products_query(only_available=True, ids=ids)
        rows = (await self.session.execute(query)).unique().scalars().all()
        return {product.id: product for product in rows}

    async def create_product(self, data: dict) -> Product:
        product = Product(**data)
        self.session.add(product)
        await self.session.commit()
        return await self.get_product(product.id)  # type: ignore[return-value]

    async def update_product(self, product: Product, data: dict) -> Product:
        for key, value in data.items():
            setattr(product, key, value)
        await self.session.commit()
        product_id = product.id
        # Yangi holat (kategoriya nomi bilan) qayta o'qilishi uchun; expire'dan keyin atributga
        # to'g'ridan-to'g'ri murojaat qilib bo'lmaydi (async'da lazy-load ishlamaydi)
        self.session.expire(product)
        return await self.get_product(product_id)  # type: ignore[return-value]

    async def delete_product(self, product: Product) -> None:
        product.is_deleted = True
        product.deleted_at = datetime.now(timezone.utc)
        await self.session.commit()
