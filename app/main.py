"""Ishga tushirish nuqtasi.

Ilovaning o'zi `app.api` da to'liq yig'iladi (routerlar, middleware, statik
fayllar, xatolik handlerlari). Bu modul faqat qulaylik uchun turadi:
`uvicorn app.main:app` va `uvicorn app.api:app` bir xil natija beradi.
"""
import uvicorn

from app.api import app  # noqa: F401  (uvicorn shu nom orqali topadi)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000,
                log_level="info", reload=False)
