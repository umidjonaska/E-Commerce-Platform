"""Sozlamalar muhitdan to'g'ri o'qilishini tekshiradi.

`config` modul darajasida, import paytida yig'iladi. Shuning uchun har bir holat
alohida jarayonda, o'z muhit o'zgaruvchilari bilan tekshiriladi.
"""
import os
import subprocess
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config(expression: str, **env_overrides: str) -> str:
    """Toza jarayonda configni yuklab, berilgan ifodani hisoblab qaytaradi."""
    env = {**os.environ, **env_overrides}
    env["PYTHONPATH"] = PROJECT_ROOT
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, "-c", f"from app.core.config import config; print({expression})"],
        capture_output=True,
        text=True,
        env=env,
        cwd=PROJECT_ROOT,
        timeout=120,
    )
    if result.returncode != 0:
        pytest.fail(f"config yuklanmadi:\n{result.stderr[-2000:]}")
    return result.stdout.strip()


# ---------- Ro'yxat tipidagi sozlamalar ----------
# Bular `pydantic_settings.BaseSettings` bilan ishlamasdi: u maydon nomiga mos
# muhit o'zgaruvchisini JSON deb o'qib, ilovani ishga tushmaydigan qilardi.


def test_allowed_origins_reads_comma_separated_value():
    output = load_config(
        "config.cors.allowed_origins",
        ALLOWED_ORIGINS="http://localhost:5173,https://shop.example",
    )

    assert output == "['http://localhost:5173', 'https://shop.example']"


def test_allowed_origins_trims_spaces_and_empty_parts():
    output = load_config(
        "config.cors.allowed_origins",
        ALLOWED_ORIGINS=" https://a.uz , , https://b.uz ",
    )

    assert output == "['https://a.uz', 'https://b.uz']"


def test_allowed_origins_falls_back_to_dev_defaults():
    output = load_config("config.cors.allowed_origins", ALLOWED_ORIGINS="")

    assert output == "['http://localhost:5173', 'http://127.0.0.1:5173']"


def test_admin_chat_ids_read_as_numbers():
    output = load_config("config.telegram.alert_chat_ids", ADMIN_CHAT_IDS="111, -222")

    assert output == "[111, -222]"


def test_admin_chat_ids_ignore_invalid_entries():
    output = load_config("config.telegram.alert_chat_ids", ADMIN_CHAT_IDS="111, abc, , 333")

    assert output == "[111, 333]"


def test_admin_chat_ids_empty_by_default():
    output = load_config("config.telegram.alert_chat_ids", ADMIN_CHAT_IDS="")

    assert output == "[]"


# ---------- Boshqa sozlamalar ----------


def test_upload_dir_is_separate_from_private_media():
    """`/uploads` ommaviy, `media/` esa faqat egasiga ko'rinadi - ular aralashmasligi kerak."""
    output = load_config("config.upload_dir", UPLOAD_DIR="")

    assert output == "uploads"


def test_short_secret_key_is_rejected_in_production():
    env = {**os.environ, "SECRET_KEY": "qisqa", "DEBUG": "False", "PYTHONPATH": PROJECT_ROOT}
    result = subprocess.run(
        [sys.executable, "-c", "from app.core.config import config"],
        capture_output=True,
        text=True,
        env=env,
        cwd=PROJECT_ROOT,
        timeout=120,
    )

    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr
