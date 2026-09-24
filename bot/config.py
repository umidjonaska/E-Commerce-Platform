import os
from dotenv import load_dotenv

load_dotenv()


def _int_list(raw: str) -> list[int]:
    result = []
    for part in raw.split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            result.append(int(part))
    return result


class BotConfig:
    token: str = os.getenv("BOT_TOKEN", "")

    # Docker'da compose API_BASE_URL beradi, lokal ishlab chiqishda .env dagi APP_URL
    api_base_url: str = os.getenv("API_BASE_URL") or os.getenv("APP_URL", "http://127.0.0.1:8000")

    # Mini App manzili. Telegram faqat HTTPS manzilni qabul qiladi.
    webapp_url: str = os.getenv("WEBAPP_URL", "").strip()

    # Ixtiyoriy: texnik xabarlar uchun. Buyurtma bildirishnomalarini backend
    # to'g'ridan-to'g'ri tegishli dillerga yuboradi.
    admin_chat_ids: list[int] = _int_list(os.getenv("ADMIN_CHAT_IDS", ""))

    @property
    def webapp_ready(self) -> bool:
        return self.webapp_url.startswith("https://")


config = BotConfig()

if not config.token:
    raise RuntimeError("BOT_TOKEN .env faylida topilmadi")
