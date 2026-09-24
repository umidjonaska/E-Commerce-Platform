import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import text

from app.database.database import Base

import app.models  # noqa: F401  (barcha modellar metadata'ga yuklanadi)

DATABASE_URL = "postgresql+asyncpg://postgres:1234@127.0.0.1/supplylink_test"


@pytest_asyncio.fixture
async def session():
    """
    Har bir test uchun toza DB: jadvallarni yaratadi, testdan keyin o'chiradi.
    """
    engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
    TestingSession = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    try:
        async with TestingSession() as s:
            result = await s.execute(text("SELECT current_database()"))
            print("TEST DB:", result.scalar())
            yield s
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


import pytest


@pytest.fixture(autouse=True)
def _no_real_telegram(monkeypatch):
    """Testlar hech qachon haqiqiy Telegram Bot API'ga so'rov yubormasligi kerak."""
    from app.core.config import config

    monkeypatch.setattr(config.telegram, "notify_enabled", False)
