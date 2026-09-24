from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

#Repositories
from app.repositories.user import UserRepository
from app.repositories.order import OrderRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.shop import ShopRepository

#Servises
from app.services.user import UserService
from app.services.order import OrderService
from app.services.catalog import CatalogService
from app.services.shop import ShopService
from app.services.admin import AdminService

#Database
from app.database.database import get_db

#Users
def user_service_dp(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(repository=UserRepository(session=db))

#Order
def order_service_dp(db: AsyncSession = Depends(get_db)) -> OrderService:
    return OrderService(repository=OrderRepository(session=db))

#Catalog
def catalog_service_dp(db: AsyncSession = Depends(get_db)) -> CatalogService:
    return CatalogService(repository=CatalogRepository(session=db))

#Shop (mijoz, diller mijozlari)
def shop_service_dp(db: AsyncSession = Depends(get_db)) -> ShopService:
    return ShopService(repository=ShopRepository(session=db))

#Admin (dillerlar, mijozlar)
def admin_service_dp(db: AsyncSession = Depends(get_db)) -> AdminService:
    return AdminService(repository=ShopRepository(session=db))
