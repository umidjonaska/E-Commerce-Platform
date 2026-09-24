import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.user import UserService
from fastapi import HTTPException

@pytest.fixture
def repo():
    return AsyncMock()

@pytest.fixture
def service(repo):
    return UserService(repo)


@pytest.mark.asyncio
async def test_get_all_user(repo, service):
    repo.get_all_user.return_value = ["user1", "user2"]

    result = await service.get_all_user()

    assert result == ["user1", "user2"]
    repo.get_all_user.assert_called_once()

@pytest.mark.asyncio
async def test_get_one_user(repo, service):
    repo.get_one_user.return_value = {"id": 1}

    result = await service.get_one_user(1)

    assert result == {"id": 1}
    repo.get_one_user.assert_called_once_with(1)

@pytest.mark.asyncio
async def test_create_user(repo, service):
    payload = MagicMock()
    payload.password_hash = "plain_password"

    fake_user = MagicMock()
    fake_user.id = 1

    with patch("app.services.user.get_password_hash", return_value="hashed_password"):
        repo.create_user.return_value = fake_user

        result = await service.create_user(payload)

        assert payload.password_hash == "hashed_password"
        repo.create_user.assert_called_once_with(payload)
        assert result == {"id": 1}

@pytest.mark.asyncio
async def test_update_user_not_found(repo, service):
    repo.get_one_user.return_value = None

    with pytest.raises(HTTPException) as exc:
        await service.update_user(1, {"name": "test"})

    assert exc.value.status_code == 404