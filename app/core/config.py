"""Ilova sozlamalari.

Barcha qiymatlar `environs` orqali muhitdan (.env) o'qiladi. Klasslar `BaseModel`
dan meros oladi, `BaseSettings` dan emas: `BaseSettings` maydon nomiga mos
muhit o'zgaruvchisini QO'SHIMCHA ravishda o'zi o'qishga urinadi va ro'yxat
tipidagi maydonlarda (masalan ALLOWED_ORIGINS="a,b") JSON kutib, ilovani
ishga tushmaydigan qilib qo'yadi.
"""
from typing import Optional

from environs import Env
from pydantic import BaseModel, Field

# environs kutubxonasidan foydalanib .env faylini o`qib olamiz
env = Env()
env.read_env()


def _str(key: str, default: str) -> str:
    """`.env` da kalit bor, lekin qiymati bo'sh bo'lsa ham standart qiymat ishlatiladi.
    (`env.str` bo'sh satrni to'liq qiymat deb qabul qiladi.)"""
    value = env.str(key, "").strip()
    return value or default


def _csv(raw: str) -> list[str]:
    """Masalan: "a, b" -> ["a", "b"]"""
    return [part.strip() for part in raw.split(",") if part.strip()]


def _chat_ids(raw: str) -> list[int]:
    """Masalan: "123, -456" -> [123, -456]. Noto'g'ri qiymatlar e'tiborsiz qoldiriladi."""
    return [int(part) for part in (p.strip() for p in raw.split(",")) if part.lstrip("-").isdigit()]


# APP parametrlari
class AppSettings(BaseModel):
    app_name: str = _str("APP_NAME", "SupplyLink")
    app_url: str = _str("APP_URL", "http://127.0.0.1:8000")
    secret_key: str = env.str("SECRET_KEY")
    algorithm: str = _str("ALGORITHM", "HS256")
    access_token_expire_minutes: int = env.int("ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    refresh_token_expire_days: int = env.int("REFRESH_TOKEN_EXPIRE_DAYS", 7)
    # "Bugun", "shu hafta" kabi chegaralar shu vaqt zonasi bo'yicha hisoblanadi
    timezone: str = _str("APP_TIMEZONE", "Asia/Tashkent")


# Baza ma`umotlari
class DatabaseSettings(BaseModel):
    db_connection: str = env.str("DB_CONNECTION")
    db_host: str = env.str("DB_HOST")
    db_port: int = env.int("DB_PORT")
    db_database: str = env.str("DB_DATABASE")
    db_username: str = env.str("DB_USERNAME")
    db_password: Optional[str] = Field(default=env.str("DB_PASSWORD", None))
    db_charset: str = _str("DB_CHARSET", "utf8")
    # SQL so'rovlarini logga chiqarish (faqat debug uchun)
    echo: bool = env.bool("SQL_ECHO", False)


# AlembicSettings
class AlembicSettings(BaseModel):
    ab_connection: str = _str("DB_CONNECTION_ALEMBIC", "postgresql+psycopg2")


# Telegram
class TelegramSettings(BaseModel):
    bot_token: str = env.str("BOT_TOKEN", "")
    # initData shu soniyadan eski bo'lsa rad etiladi
    init_data_max_age: int = env.int("TELEGRAM_INIT_DATA_MAX_AGE", 86400)
    # Bildirishnomalarni o'chirib qo'yish mumkin (test/lokal ishlab chiqish uchun)
    notify_enabled: bool = env.bool("NOTIFY_ENABLED", True)
    # Server xatoliklari haqida xabar keladigan chat ID'lar
    alert_chat_ids: list[int] = _chat_ids(env.str("ADMIN_CHAT_IDS", ""))
    # Bir xil xatolik shu soniya ichida faqat bir marta xabar qilinadi
    alert_throttle_seconds: int = env.int("ALERT_THROTTLE_SECONDS", 300)


# CORS: front nginx orqali bir origin'da bo'lsa kerak emas, dev uchun kerak
class CorsSettings(BaseModel):
    allowed_origins: list[str] = _csv(
        _str("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )


# Settings barcha settingslar
class Settings(BaseModel):
    app: AppSettings = AppSettings()
    database: DatabaseSettings = DatabaseSettings()
    alembic: AlembicSettings = AlembicSettings()
    telegram: TelegramSettings = TelegramSettings()
    cors: CorsSettings = CorsSettings()
    static: str = _str("STATIC", "static")
    # Ommaviy fayllar (mahsulot rasmlari). Eski `media/` papkasidan ataylab ajratilgan:
    # u yerdagi fayllar faqat egasiga ko'rinadigan Media API orqali beriladi.
    upload_dir: str = _str("UPLOAD_DIR", "uploads")
    debug: bool = env.bool("DEBUG", False)


# Configa yuklash
config = Settings()

if not config.debug and len(config.app.secret_key) < 32:
    raise RuntimeError("SECRET_KEY production uchun kamida 32 belgidan iborat bo'lishi kerak")
