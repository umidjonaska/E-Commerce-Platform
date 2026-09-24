FROM python:3.12-slim

WORKDIR /app

# Tizim darajasidagi kutubxonalar (asyncpg, argon2 kabi paketlar uchun kerak bo'lishi mumkin)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Avval faqat requirements.txt nusxalanadi - Docker layer caching uchun
# (agar faqat kod o'zgarsa, kutubxonalarni qayta o'rnatish shart emas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Endi butun loyiha kodi nusxalanadi
COPY app/ ./app/
# Bot backend ichida webhook orqali ishlaydi (app/services/telegram_webhook.py)
COPY bot/ ./bot/
COPY migrations/ ./migrations/
COPY alembic.ini .

EXPOSE 8000

# Render/Fly kabi platformalar portni $PORT orqali beradi, shuning uchun shell
# shakli ishlatiladi. Lokalda va Compose'da $PORT bo'lmaydi -> 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]