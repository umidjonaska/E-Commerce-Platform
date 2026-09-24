"""Asosiy application.

Ilova shu modulda TO'LIQ yig'iladi: routerlar, middleware, statik fayllar va
xatolik handlerlari. Shu sababli `app.api:app` ham, `app.main:app` ham bir xil
ishlaydi - biri ikkinchisidan "kamroq sozlangan" bo'lib qolmaydi.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from starlette import status
from starlette.background import BackgroundTask
from starlette.responses import JSONResponse

from app.core.config import config

from app.routes import telegram, user

from app.routes.v1 import admin, auth as auth_v1, catalog, diller, me, orders

from app.auth import login
from app.services.alerts import send_error_alert
from app.services.telegram_webhook import telegram_webhook

logger = logging.getLogger(__name__)


class HealthCheckLogFilter(logging.Filter):
    """Docker healthcheck /health ni muntazam so'raydi - u access logni to'ldirib
    yuboradi va haqiqiy so'rovlarni ko'rib bo'lmay qoladi."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        # uvicorn access log args: (client, method, path, http_version, status)
        return not (isinstance(args, tuple) and len(args) >= 3 and args[2] == "/health")


logging.getLogger("uvicorn.access").addFilter(HealthCheckLogFilter())


api = APIRouter()

#Users
api.include_router(user.router, tags=["Users"])
api.include_router(login.auth_route, tags=["Auth"])
api.include_router(telegram.router, tags=["Telegram"])

# SupplyLink API (Mini App, diller va superadmin dashboardlari)
v1 = APIRouter(prefix="/api/v1")
v1.include_router(auth_v1.router, tags=["Auth v1"])
v1.include_router(me.router, tags=["Me"])
v1.include_router(catalog.router, tags=["Catalog"])
v1.include_router(orders.router, tags=["Orders"])
v1.include_router(diller.router, tags=["Diller"])
v1.include_router(admin.router, tags=["Superadmin"])

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Webhook sozlanmagan bo'lsa (lokal, testlar) ikkalasi ham hech narsa qilmaydi
    await telegram_webhook.startup()
    try:
        yield
    finally:
        await telegram_webhook.shutdown()


app = FastAPI(
    title=config.app.app_name,
    description=f"{config.app.app_name} API",
    version='2.0',
    docs_url='/docs',  # None - dokumentatsiyani o`chirish
    redoc_url='/redoc',  # None - dokumentatsiyani o`chirish
    debug=config.debug,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# Corsga faqat sozlangan originlarga ruxsat beriladi. Auth Bearer token bilan
# (cookie yo'q), shuning uchun credentials yoqilmaydi.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP javoblarini siqish uchun ishlatiladi, bu resurslarni uzatishni tezlashtiradi va tarmoqli resurslarni tejaydi.
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)

# Yuklangan rasmlar (mahsulot rasmlari) /uploads/... orqali beriladi.
_upload_dir = Path(config.upload_dir)
_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Bir vaqtda yuborilgan bir xil so'rovlar (unique cheklovi) 500 emas, 409 qaytaradi."""
    logger.warning("Integrity xatosi: %s %s", request.method, request.url.path, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Bu ma'lumot allaqachon mavjud yoki boshqa so'rov bilan to'qnashdi."},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Kutilmagan xatolik: %s %s", request.method, request.url.path)

    detail = f"{type(exc).__name__}: {exc}" if config.debug else "Serverda kutilmagan xatolik yuz berdi."
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail},
        # Xabar javob yuborilgandan KEYIN ketadi - mijoz Telegram'ni kutib turmaydi
        background=BackgroundTask(send_error_alert, exc, request.method, request.url.path),
    )


@app.get('/')
async def main():
    return {
        'status': 200,
        'message': config.app.app_name
    }


@app.get('/health', include_in_schema=False)
async def health():
    return {'status': 'ok'}


app.include_router(api)
app.include_router(v1)
