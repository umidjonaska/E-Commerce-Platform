from fastapi import APIRouter, Depends, Query

from app.auth.services import get_current_user
from app.deps import catalog_service_dp
from app.schemas.catalog import CategoryResponse, ProductResponse
from app.schemas.common import OffsetPage, PageQuery
from app.services.catalog import CatalogService

router = APIRouter()


@router.get("/categories", response_model=list[CategoryResponse], summary="Faol kategoriyalar")
async def categories(
    current_user: dict = Depends(get_current_user),
    service: CatalogService = Depends(catalog_service_dp),
):
    return await service.client_categories()


def _parse_ids(ids: str | None) -> list[int] | None:
    if not ids:
        return None
    try:
        parsed = [int(part) for part in ids.split(",") if part.strip()]
    except ValueError:
        return []
    # Savatni qayta tekshirish uchun: ortiqcha uzun ro'yxatlar kesiladi
    return parsed[:100]


@router.get("/products", response_model=OffsetPage[ProductResponse], summary="Faol mahsulotlar")
async def products(
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=100),
    ids: str | None = Query(default=None, description="Vergul bilan ajratilgan mahsulot ID'lari"),
    page: PageQuery = Depends(),
    current_user: dict = Depends(get_current_user),
    service: CatalogService = Depends(catalog_service_dp),
):
    parsed = _parse_ids(ids)
    if parsed == []:
        return {"items": [], "total": 0, "page": page.page, "size": page.size, "pages": 1}
    return await service.client_products(page, category_id=category_id, q=q, ids=parsed)


@router.get("/products/{product_id}", response_model=ProductResponse, summary="Mahsulot tafsiloti")
async def product(
    product_id: int,
    current_user: dict = Depends(get_current_user),
    service: CatalogService = Depends(catalog_service_dp),
):
    return await service.client_product(product_id)
