"""Mahsulot rasmlarini yuklash: turi, hajmi va haqiqiy rasm ekanligi tekshiriladi."""
import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError

from app.core.config import config

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_DIMENSION = 1600
# ~50 megapiksel: oddiy mahsulot rasmi uchun bundan kattasi kerak emas
MAX_PIXELS = 50_000_000
FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
PRODUCT_DIR = "product"


def _process(raw: bytes) -> tuple[bytes, str]:
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(raw))
        fmt = image.format
        width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(status_code=422, detail="Fayl yaroqli rasm emas")

    if fmt not in FORMATS:
        raise HTTPException(status_code=422, detail="Faqat JPEG, PNG yoki WEBP rasmlar qabul qilinadi")

    # "Decompression bomb": kichik fayl xotirada ulkan rasmga yoyilishi mumkin
    if width * height > MAX_PIXELS:
        raise HTTPException(status_code=422, detail="Rasm o'lchami juda katta")

    # EXIF (GPS va h.k.) ma'lumotlari olib tashlanadi, katta rasm kichraytiriladi
    image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
    out = io.BytesIO()
    if fmt == "JPEG":
        image.convert("RGB").save(out, format="JPEG", quality=85, optimize=True)
    else:
        image.save(out, format=fmt, optimize=True)
    return out.getvalue(), FORMATS[fmt]


async def save_product_image(file: UploadFile) -> str:
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()

    if not raw:
        raise HTTPException(status_code=422, detail="Fayl bo'sh")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Rasm hajmi 5 MB dan oshmasligi kerak")

    content, suffix = await run_in_threadpool(_process, raw)

    folder = Path(config.upload_dir) / PRODUCT_DIR
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{suffix}"
    await run_in_threadpool((folder / filename).write_bytes, content)

    return f"/uploads/{PRODUCT_DIR}/{filename}"
