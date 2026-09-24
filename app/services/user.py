from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.base import BaseService
from app.utils.pagination import PageParams

from app.auth.services import get_password_hash
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserUpdate, UserSelfUpdate


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Bunday username yoki email allaqachon mavjud",
    )


class UserService(BaseService[UserRepository]):
    async def get_all_user(self, page_params: PageParams | None = None):
        return await self.repository.get_all_user(page_params)

    async def get_one_user(self, user_id: int):
        return await self.repository.get_one_user(user_id)

    async def create_user(self, payload: UserCreate):
        payload.password_hash = get_password_hash(payload.password_hash)

        try:
            user = await self.repository.create_user(payload)
        except IntegrityError:
            await self.repository.session.rollback()
            raise _conflict()
        return {"id": user.id}

    async def create_admin_user(self, payload: UserCreate):
        """
        Faqat superadmin chaqiradi - role admin/diller/superadmin bo'lishi mumkin.
        To'liq user obyektini qaytaradi.
        """
        payload.password_hash = get_password_hash(payload.password_hash)
        try:
            return await self.repository.create_user(payload)
        except IntegrityError:
            await self.repository.session.rollback()
            raise _conflict()

    async def update_user(self, user_id: int, payload: UserUpdate | UserSelfUpdate):
        user = await self.repository.get_one_user(user_id)

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if payload.password_hash:
            payload.password_hash = get_password_hash(payload.password_hash)
        else:
            # bo'sh/None parol berilsa mavjud xeshni buzmaslik uchun e'tiborsiz qoldiramiz
            payload.model_fields_set.discard("password_hash")

        try:
            return await self.repository.update_user(user_id, payload)
        except IntegrityError:
            await self.repository.session.rollback()
            raise _conflict()

    async def delete_user(self, user_id: int):
        user = await self.repository.get_one_user(user_id)

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return await self.repository.delete_user(user_id)
