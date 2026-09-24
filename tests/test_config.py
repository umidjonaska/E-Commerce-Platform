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


# ---------- DATABASE_URL ----------
# Render, Neon, Railway bazani bitta satr qilib beradi. Uni alohida
# DB_HOST/DB_PORT/... ga ajratish kerak, aks holda deploy paytida qo'lda
# ko'chirishda xato qilish oson.


def load_config_error(**env_overrides: str) -> str:
    """Config yuklanishi xato bilan tugashini kutadi va stderr ni qaytaradi."""
    env = {**os.environ, **env_overrides}
    env["PYTHONPATH"] = PROJECT_ROOT
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, "-c", "from app.core.config import config"],
        capture_output=True, text=True, env=env, cwd=PROJECT_ROOT, timeout=120,
    )
    if result.returncode == 0:
        pytest.fail("config yuklanishi xato berishi kerak edi, lekin muvaffaqiyatli tugadi")
    return result.stderr


def test_database_url_is_split_into_parts():
    output = load_config(
        "(config.database.db_host, config.database.db_port, "
        "config.database.db_username, config.database.db_database)",
        DATABASE_URL="postgresql://neon_user:secret@ep-cool-x.eu-central-1.aws.neon.tech:5432/supplylink",
    )

    assert output == "('ep-cool-x.eu-central-1.aws.neon.tech', 5432, 'neon_user', 'supplylink')"


def test_database_url_reads_sslmode_from_query():
    output = load_config(
        "config.database.db_sslmode",
        DATABASE_URL="postgresql://u:p@host/db?sslmode=require",
    )

    assert output == "require"


def test_database_url_defaults_port_and_sslmode():
    output = load_config(
        "(config.database.db_port, config.database.db_sslmode)",
        DATABASE_URL="postgresql://u:p@host/db",
    )

    assert output == "(5432, 'prefer')"


def test_database_url_decodes_escaped_password():
    """Neon parollarida @ va # uchrashi mumkin - ular URL'da %40, %23 bo'ladi."""
    output = load_config(
        "config.database.db_password",
        DATABASE_URL="postgresql://u:p%40ss%231@host/db",
    )

    assert output == "p@ss#1"


def test_database_url_without_database_name_is_rejected():
    stderr = load_config_error(DATABASE_URL="postgresql://user:pass@host:5432")

    assert "DATABASE_URL noto'g'ri formatda" in stderr


def test_separate_db_variables_still_work_without_database_url():
    output = load_config(
        "(config.database.db_host, config.database.db_database)",
        DATABASE_URL="",
        DB_HOST="127.0.0.1",
        DB_DATABASE="supplylink",
    )

    assert output == "('127.0.0.1', 'supplylink')"
