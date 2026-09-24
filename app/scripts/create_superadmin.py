"""SUPERADMIN yaratish yoki parolini yangilash.

Ishlatish (parol kodga yozilmaydi):

    python -m app.scripts.create_superadmin --username umidjon
    # parol so'raladi. Yoki muhit o'zgaruvchilari orqali (CI/Docker uchun):
    SUPERADMIN_USERNAME=umidjon SUPERADMIN_PASSWORD=... python -m app.scripts.create_superadmin
"""
import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import select

from app.auth.services import get_password_hash
from app.database.database import AsyncSessionLocal
from app.models import User  # noqa: F401  (registry uchun barcha modellar yuklanadi)
from app.schemas.user import UserRole

MIN_PASSWORD_LENGTH = 10


async def create_or_update(username: str, password: str, email: str | None) -> tuple[int, bool]:
    async with AsyncSessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()

        created = user is None
        if created:
            user = User(username=username, email=email, role=UserRole.SUPERADMIN,
                        password_hash=get_password_hash(password))
            session.add(user)
        else:
            user.role = UserRole.SUPERADMIN
            user.password_hash = get_password_hash(password)
            user.is_blocked = False
            user.is_deleted = False
            user.deleted_at = None
            user.refresh_token = None  # eski sessiyalar bekor bo'ladi

        await session.commit()
        return user.id, created


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", default=os.getenv("SUPERADMIN_USERNAME"))
    parser.add_argument("--email", default=os.getenv("SUPERADMIN_EMAIL"))
    args = parser.parse_args()

    if not args.username:
        parser.error("--username (yoki SUPERADMIN_USERNAME) kerak")

    password = os.getenv("SUPERADMIN_PASSWORD") or getpass.getpass("Parol: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Parol kamida {MIN_PASSWORD_LENGTH} belgidan iborat bo'lishi kerak", file=sys.stderr)
        return 1

    user_id, created = asyncio.run(create_or_update(args.username, password, args.email))
    print(f"Superadmin {'yaratildi' if created else 'yangilandi'}: id={user_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
