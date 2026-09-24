from fastapi import HTTPException, status

from app.core.base import BaseService
from app.models.catalog import Category, Product
from app.repositories.catalog import CatalogRepository
from app.schemas.catalog import CategoryIn, CategoryUpdate, ProductIn, ProductUpdate
from app.schemas.common import PageQuery, make_page


def category_out(category: Category, products_count: int = 0) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "products_count": products_count,
        "created_at": category.created_at,
    }


def product_out(product: Product) -> dict:
    return {
        "id": product.id,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "name": product.name,
        "description": product.description,
        "price": product.price,
        "unit": product.unit,
        "min_quantity": product.min_quantity,
        "image_url": product.image_url,
        "is_active": product.is_active,
        "created_at": product.created_at,
    }


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} topilmadi")


class CatalogService(BaseService[CatalogRepository]):
    # ---------- Mijoz uchun ----------

    async def client_categories(self) -> list[dict]:
        rows = await self.repository.list_categories(only_active=True)
        return [category_out(c, count) for c, count in rows]

    async def client_products(
        self, page: PageQuery, *, category_id: int | None, q: str | None, ids: list[int] | None
    ) -> dict:
        query = self.repository.products_query(only_available=True, category_id=category_id, q=q, ids=ids)
        products, total = await self.repository.paginate_products(query, page.offset, page.size)
        return make_page([product_out(p) for p in products], total, page)

    async def client_product(self, product_id: int) -> dict:
        product = await self.repository.get_product(product_id, only_available=True)
        if product is None:
            raise _not_found("Mahsulot")
        return product_out(product)

    # ---------- Superadmin: kategoriyalar ----------

    async def admin_categories(self) -> list[dict]:
        rows = await self.repository.list_categories(only_active=False)
        return [category_out(c, count) for c, count in rows]

    async def create_category(self, payload: CategoryIn) -> dict:
        if await self.repository.category_name_exists(payload.name):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bunday nomli kategoriya mavjud")
        category = await self.repository.create_category(payload.model_dump())
        return category_out(category, 0)

    async def update_category(self, category_id: int, payload: CategoryUpdate) -> dict:
        category = await self.repository.get_category(category_id)
        if category is None:
            raise _not_found("Kategoriya")

        data = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "name" in data and await self.repository.category_name_exists(data["name"], exclude_id=category_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bunday nomli kategoriya mavjud")

        category = await self.repository.update_category(category, data)
        return category_out(category, await self.repository.count_products_in_category(category_id))

    async def delete_category(self, category_id: int) -> None:
        category = await self.repository.get_category(category_id)
        if category is None:
            raise _not_found("Kategoriya")

        if await self.repository.count_products_in_category(category_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Kategoriyada mahsulotlar bor. Avval mahsulotlarni o'chiring yoki boshqa kategoriyaga ko'chiring",
            )
        await self.repository.delete_category(category)

    # ---------- Superadmin: mahsulotlar ----------

    async def admin_products(
        self, page: PageQuery, *, category_id: int | None, q: str | None, is_active: bool | None
    ) -> dict:
        query = self.repository.products_query(
            only_available=False, category_id=category_id, q=q, is_active=is_active
        )
        products, total = await self.repository.paginate_products(query, page.offset, page.size)
        return make_page([product_out(p) for p in products], total, page)

    async def admin_product(self, product_id: int) -> dict:
        product = await self.repository.get_product(product_id)
        if product is None:
            raise _not_found("Mahsulot")
        return product_out(product)

    async def create_product(self, payload: ProductIn) -> dict:
        if await self.repository.get_category(payload.category_id) is None:
            raise HTTPException(status_code=422, detail="Kategoriya topilmadi")
        product = await self.repository.create_product(payload.model_dump())
        return product_out(product)

    async def update_product(self, product_id: int, payload: ProductUpdate) -> dict:
        product = await self.repository.get_product(product_id)
        if product is None:
            raise _not_found("Mahsulot")

        # image_url uchun None qiymati "rasmni olib tashlash" ma'nosida ishlatiladi
        data = payload.model_dump(exclude_unset=True)
        for required in ("category_id", "name", "price", "unit", "min_quantity", "is_active"):
            if required in data and data[required] is None:
                data.pop(required)

        if "category_id" in data and await self.repository.get_category(data["category_id"]) is None:
            raise HTTPException(status_code=422, detail="Kategoriya topilmadi")

        product = await self.repository.update_product(product, data)
        return product_out(product)

    async def delete_product(self, product_id: int) -> None:
        product = await self.repository.get_product(product_id)
        if product is None:
            raise _not_found("Mahsulot")
        await self.repository.delete_product(product)
