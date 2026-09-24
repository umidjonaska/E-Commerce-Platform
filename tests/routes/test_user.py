import pytest
import pytest_asyncio

from sqlalchemy import select

from app.models.user import User
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserRole


@pytest_asyncio.fixture
async def user_repo(session):
    return UserRepository(session)


@pytest_asyncio.fixture
async def existing_user(user_repo):
    payload = UserCreate(
        username="testuser",
        email="testuser@mail.ru",
        role=UserRole.USER,
        password_hash="plainpassword123",
    )
    return await user_repo.create_user(payload)


@pytest_asyncio.fixture
async def current_user_override(existing_user):
    """
    get_current_user o'rniga qaytariladigan soxta foydalanuvchi (dict).
    auth/services.py'dagi serialize_user() formatiga mos: id, email, role.
    """
    return {
        "id": existing_user.id,
        "email": existing_user.email,
        "role": existing_user.role.value,
    }


@pytest.mark.asyncio
async def test_create_user_no_auth_required(client):
    response = await client.post(
        "/users/",
        json={
            "username": "newuser",
            "email": "newuser@mail.ru",
            "role": "user",
            "password_hash": "somepassword",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_create_user_defaults_to_user_role(client, session):
    """
    role ko'rsatilmasa, default USER bo'lishi kerak (ADMIN emas)
    """
    response = await client.post(
        "/users/",
        json={
            "username": "defaultroleuser",
            "email": "defaultrole@mail.ru",
            "password_hash": "somepassword",
        },
    )

    assert response.status_code == 201
    user_id = response.json()["id"]

    result = await session.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one()

    assert db_user.role == UserRole.USER


@pytest.mark.asyncio
async def test_create_user_hashes_password(client, session):
    response = await client.post(
        "/users/",
        json={
            "username": "secureuser",
            "email": "secure@mail.ru",
            "role": "user",
            "password_hash": "plaintext123",
        },
    )

    assert response.status_code == 201
    user_id = response.json()["id"]

    result = await session.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one()

    assert db_user.password_hash != "plaintext123"
    assert db_user.password_hash.startswith("$argon2")


@pytest.mark.asyncio
async def test_get_all_users_requires_auth(client):
    response = await client.get("/users/")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_all_users_with_superadmin(superadmin_client, existing_user):
    response = await superadmin_client.get("/users/")

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    usernames = {item["username"] for item in data["data"]}
    assert "testuser" in usernames


@pytest.mark.asyncio
async def test_get_one_user_with_auth(authorized_client, existing_user):
    response = await authorized_client.get(f"/users/{existing_user.id}/")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == existing_user.id
    assert data["username"] == "testuser"

    # xavfsizlik: password_hash javobda chiqmasligi kerak
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_get_one_user_not_found(superadmin_client):
    response = await superadmin_client.get("/users/9999/")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_all_users_forbidden_for_regular_user(authorized_client):
    response = await authorized_client.get("/users/")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_other_user_forbidden_for_regular_user(authorized_client):
    response = await authorized_client.get("/users/9999/")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_self_cannot_change_role(authorized_client, existing_user):
    """Privilege escalation: oddiy user o'z rolini o'zgartira olmaydi."""
    response = await authorized_client.put("/users/", json={"role": "superadmin", "full_name": "Hacker"})

    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "user"
    assert data["full_name"] == "Hacker"


@pytest.mark.asyncio
async def test_delete_user_requires_auth(client, existing_user):
    response = await client.delete(f"/users/{existing_user.id}")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_delete_user_forbidden_for_regular_user(authorized_client, existing_user):
    response = await authorized_client.delete(f"/users/{existing_user.id}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_admin_returns_user(superadmin_client):
    response = await superadmin_client.post(
        "/users/admin",
        json={"username": "newdiller", "email": "nd@mail.ru", "role": "diller", "password_hash": "12345678"},
    )

    assert response.status_code == 201
    assert response.json()["role"] == "diller"


@pytest.mark.asyncio
async def test_create_admin_forbidden_for_regular_user(authorized_client):
    response = await authorized_client.post(
        "/users/admin",
        json={"username": "x", "email": "x@mail.ru", "role": "admin", "password_hash": "12345678"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_own_profile(authorized_client, existing_user):
    response = await authorized_client.put(
        "/users/",
        json={"username": "updated_username"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "updated_username"


@pytest.mark.asyncio
async def test_update_own_profile_password(authorized_client, existing_user, session):
    response = await authorized_client.put(
        "/users/",
        json={"password_hash": "newplainpassword"},
    )

    assert response.status_code == 200

    result = await session.execute(select(User).where(User.id == existing_user.id))
    db_user = result.scalar_one()

    assert db_user.password_hash != "newplainpassword"
    assert db_user.password_hash.startswith("$argon2")