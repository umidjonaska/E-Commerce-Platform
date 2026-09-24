from fastapi import HTTPException
from datetime import timezone, datetime

from sqlalchemy import select, insert

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate

from app.core.base import BaseRepository
from app.utils.pagination import PageParams, pagination


class UserRepository(BaseRepository):

    async def get_all_user(self, page_params: PageParams | None = None):
        query = (
            select(User)
            .where(User.is_deleted == False)
        )
        if page_params:
            return await pagination(self.session, query, page_params)
        result = await self.session.execute(query)
        return result.scalars().all()


    async def get_one_user(self, user_id: int):
        query = (
            select(User)
            .where(User.id == user_id, User.is_deleted == False)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def create_user(
        self,
        payload: UserCreate,
        *,
        flush: bool = False,
        commit: bool = True,
    ) -> User:
        """
        Yangi user yaratish.
        """

        user = User(**payload.model_dump())

        self.session.add(user)

        if flush:
            await self.session.flush()

        if commit:
            await self.session.commit()
            await self.session.refresh(user)

        return user

    async def update_user(
        self,
        user_id: int,
        payload: UserUpdate,
        *,
        flush: bool = False,
        commit: bool = True
    ) -> User:

        user = await self.get_one_user(user_id)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(user, key, value)

        if flush:
            await self.session.flush()

        if commit:
            await self.session.commit()

        return user

    async def delete_user(self, user_id: int) -> bool | None:
        user = await self.session.get(User, user_id)
        if not user or user.is_deleted:
            return None

        user.is_deleted = True
        user.deleted_at = datetime.now(timezone.utc)
        await self.session.commit()
        return True
