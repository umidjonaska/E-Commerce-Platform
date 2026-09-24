from sqlalchemy import Integer, String, DateTime, Enum, Boolean, BigInteger
from sqlalchemy.orm import relationship, Mapped, mapped_column

from datetime import datetime, timezone

from app.schemas.user import UserRole
from app.database.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER, nullable=False)
    # Refresh tokenning SHA-256 xeshi saqlanadi (token o'zi emas)
    refresh_token: Mapped[str] = mapped_column(String(255), nullable=True)

    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Diller ma'lumotlari (faqat DILLER rolida to'ldirilgan bo'ladi)
    profile = relationship(
        "DillerProfile", uselist=False, lazy="joined", cascade="all, delete-orphan"
    )
