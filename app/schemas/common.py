from math import ceil
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")

MAX_PAGE_SIZE = 100


class OffsetPage(BaseModel, Generic[T]):
    """Sahifa raqami bo'yicha pagination (jadvallar uchun)."""
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


class PageQuery:
    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Sahifa raqami (1 dan boshlanadi)"),
        size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    ):
        self.page = page
        self.size = size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


def make_page(items: list, total: int, page: PageQuery) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page.page,
        "size": page.size,
        "pages": max(ceil(total / page.size), 1),
    }
