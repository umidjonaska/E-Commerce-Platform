from typing import AsyncGenerator
from app.core.config import config
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# URL.create parol ichidagi maxsus belgilarni (@, :, / ...) to'g'ri escape qiladi
SQLALCHEMY_DATABASE_URL = URL.create(
    drivername=config.database.db_connection,
    username=config.database.db_username,
    password=config.database.db_password,
    host=config.database.db_host,
    port=config.database.db_port,
    database=config.database.db_database,
)

# asyncpg `sslmode` nomini bilmaydi, u shu qiymatlarni `ssl` sifatida qabul qiladi.
# Neon/Render kabi boshqariladigan bazalar uchun DB_SSLMODE=require bo'ladi.
_connect_args = {"ssl": config.database.db_sslmode} if "asyncpg" in config.database.db_connection else {}

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=config.database.echo,
    pool_size=20,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as db:
        try:
            yield db
        except Exception:
            await db.rollback()
            raise
        finally:
            await db.close()