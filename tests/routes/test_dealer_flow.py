"""Diller platformasi: mijoz -> buyurtma -> diller -> superadmin oqimlari (haqiqiy JWT + haqiqiy DB)."""
from datetime import date, timedelta
from io import BytesIO
from types import SimpleNamespace

import pytest
import pytest_asyncio
from PIL import Image

from app.auth.services import create_access_token
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserRole

API = "/api/v1"


async def _actor(session, role: UserRole, username: str, **extra):
    user = await UserRepository(session).create_user(
        UserCreate(username=username, email=None, role=role, password_hash="x", **extra)
    )
    token = await create_access_token({"sub": str(user.id)})
    return user, {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def world(client, session):
    """Superadmin, diller (API orqali yaratilgan), kategoriya+mahsulotlar va ro'yxatdan o'tgan mijoz."""
    admin, admin_h = await _actor(session, UserRole.SUPERADMIN, "boss")

    r = await client.post(f"{API}/admin/dillers", headers=admin_h, json={
        "username": "diller1", "password": "password123", "full_name": "Diller Bir",
        "company_name": "Bir MChJ", "region": "Toshkent", "phone": "+998900000001",
    })
    assert r.status_code == 201, r.text
    diller = r.json()
    login = await client.post(f"{API}/auth/login", json={"username": "diller1", "password": "password123"})
    assert login.status_code == 200, login.text
    diller_h = {"Authorization": f"Bearer {login.json()['access_token']}"}

    cat = (await client.post(f"{API}/admin/categories", headers=admin_h, json={"name": "Tuxum"})).json()
    eggs = (await client.post(f"{API}/admin/products", headers=admin_h, json={
        "category_id": cat["id"], "name": "Tuxum C1", "price": 1500, "unit": "dona", "min_quantity": 10,
    })).json()
    milk = (await client.post(f"{API}/admin/products", headers=admin_h, json={
        "category_id": cat["id"], "name": "Sut", "price": 12000, "unit": "litr",
    })).json()

    user, client_h = await _actor(session, UserRole.USER, "tg_1001", telegram_id=1001)
    r = await client.post(f"{API}/me/shop", headers=client_h, json={
        "full_name": "Aziz Karimov", "name": "Aziz market", "phone": "+998901112233",
        "address": "Chilonzor 5", "diller_id": diller["id"],
    })
    assert r.status_code == 201, r.text

    return SimpleNamespace(
        admin_h=admin_h, diller=diller, diller_h=diller_h, cat=cat, eggs=eggs, milk=milk,
        user=user, client_h=client_h, client=client,
    )


async def _place(w, items=None, **extra):
    # `items=[]` ataylab bo'sh ro'yxat yuborish uchun ishlatiladi, shuning uchun `or` emas
    if items is None:
        items = [{"product_id": w.eggs["id"], "quantity": 20}]
    return await w.client.post(f"{API}/orders", headers=w.client_h, json={"items": items, **extra})


# ---------------- Ro'yxatdan o'tish ----------------

@pytest.mark.asyncio
async def test_register_requires_valid_diller(client, session):
    _, h = await _actor(session, UserRole.USER, "tg_5", telegram_id=5)

    r = await client.post(f"{API}/me/shop", headers=h, json={
        "full_name": "Ali", "name": "Shop", "phone": "12345", "address": "Manzil", "diller_id": 9999,
    })

    assert r.status_code == 422


@pytest.mark.asyncio
async def test_register_twice_conflicts(world):
    r = await world.client.post(f"{API}/me/shop", headers=world.client_h, json={
        "full_name": "Aziz", "name": "Yana", "phone": "12345", "address": "Manzil", "diller_id": world.diller["id"],
    })

    assert r.status_code == 409


@pytest.mark.asyncio
async def test_me_returns_shop_and_diller(world):
    r = await world.client.get(f"{API}/me", headers=world.client_h)

    assert r.status_code == 200
    data = r.json()
    assert data["shop"]["name"] == "Aziz market"
    assert data["shop"]["diller"]["name"] == "Bir MChJ"
    assert data["user"]["full_name"] == "Aziz Karimov"


@pytest.mark.asyncio
async def test_client_can_update_own_shop_but_not_diller(world):
    r = await world.client.put(f"{API}/me/shop", headers=world.client_h, json={
        "name": "Yangi market", "phone": "+998907778899", "address": "Yunusobod 1", "diller_id": 12345,
    })

    assert r.status_code == 200
    assert r.json()["shop"]["name"] == "Yangi market"
    assert r.json()["shop"]["diller"]["id"] == world.diller["id"]


@pytest.mark.asyncio
async def test_public_dillers_hides_blocked(world):
    listed = await world.client.get(f"{API}/dillers", headers=world.client_h)
    assert [d["name"] for d in listed.json()] == ["Bir MChJ"]

    await world.client.post(f"{API}/admin/dillers/{world.diller['id']}/block", headers=world.admin_h)

    r = await world.client.get(f"{API}/dillers", headers=world.client_h)
    assert r.json() == []


# ---------------- Katalog ----------------

@pytest.mark.asyncio
async def test_client_sees_only_active_catalog(world):
    await world.client.put(f"{API}/admin/products/{world.milk['id']}", headers=world.admin_h, json={"is_active": False})

    r = await world.client.get(f"{API}/products", headers=world.client_h)

    assert [p["name"] for p in r.json()["items"]] == ["Tuxum C1"]


@pytest.mark.asyncio
async def test_inactive_category_hides_products(world):
    await world.client.put(f"{API}/admin/categories/{world.cat['id']}", headers=world.admin_h, json={"is_active": False})

    cats = await world.client.get(f"{API}/categories", headers=world.client_h)
    prods = await world.client.get(f"{API}/products", headers=world.client_h)

    assert cats.json() == []
    assert prods.json()["total"] == 0


@pytest.mark.asyncio
async def test_products_search_and_ids_filter(world):
    r = await world.client.get(f"{API}/products?q=sut", headers=world.client_h)
    assert [p["name"] for p in r.json()["items"]] == ["Sut"]

    r = await world.client.get(f"{API}/products?ids={world.eggs['id']}", headers=world.client_h)
    assert [p["name"] for p in r.json()["items"]] == ["Tuxum C1"]

    r = await world.client.get(f"{API}/products?ids=abc", headers=world.client_h)
    assert r.json()["items"] == []


@pytest.mark.asyncio
async def test_catalog_requires_auth(client):
    assert (await client.get(f"{API}/products")).status_code == 401


# ---------------- Buyurtma yaratish ----------------

@pytest.mark.asyncio
async def test_create_order_computes_total_on_server(world):
    r = await _place(world, [
        {"product_id": world.eggs["id"], "quantity": 20},
        {"product_id": world.milk["id"], "quantity": 2},
        {"product_id": world.milk["id"], "quantity": 1},  # dublikat birlashtiriladi
    ])

    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["total_amount"] == 20 * 1500 + 3 * 12000
    assert data["items_count"] == 2
    assert data["shop_name"] == "Aziz market"
    assert data["delivery_address"] == "Chilonzor 5"
    assert data["can_edit"] and data["can_cancel"]


@pytest.mark.asyncio
async def test_create_order_enforces_min_quantity(world):
    r = await _place(world, [{"product_id": world.eggs["id"], "quantity": 5}])

    assert r.status_code == 422
    assert "minimal" in r.json()["detail"]


@pytest.mark.asyncio
async def test_create_order_rejects_inactive_or_unknown_product(world):
    await world.client.put(f"{API}/admin/products/{world.milk['id']}", headers=world.admin_h, json={"is_active": False})

    assert (await _place(world, [{"product_id": world.milk["id"], "quantity": 1}])).status_code == 422
    assert (await _place(world, [{"product_id": 987654, "quantity": 1}])).status_code == 422


@pytest.mark.asyncio
async def test_create_order_validates_payload(world):
    assert (await _place(world, [])).status_code == 422
    assert (await _place(world, [{"product_id": world.eggs["id"], "quantity": 0}])).status_code == 422
    assert (await _place(world, [{"product_id": world.eggs["id"], "quantity": 10}], latitude=200)).status_code == 422


@pytest.mark.asyncio
async def test_order_requires_shop_and_client_role(client, session, world):
    _, h = await _actor(session, UserRole.USER, "tg_77", telegram_id=77)
    r = await client.post(f"{API}/orders", headers=h, json={"items": [{"product_id": world.eggs["id"], "quantity": 10}]})
    assert r.status_code == 409  # do'kon yo'q

    r = await client.post(f"{API}/orders", headers=world.diller_h,
                          json={"items": [{"product_id": world.eggs["id"], "quantity": 10}]})
    assert r.status_code == 403  # diller mijoz sifatida buyurtma bera olmaydi


@pytest.mark.asyncio
async def test_order_blocked_when_diller_blocked(world):
    await world.client.post(f"{API}/admin/dillers/{world.diller['id']}/block", headers=world.admin_h)

    r = await _place(world)

    assert r.status_code == 409


@pytest.mark.asyncio
async def test_order_price_snapshot_survives_price_change(world):
    order = (await _place(world)).json()
    await world.client.put(f"{API}/admin/products/{world.eggs['id']}", headers=world.admin_h, json={"price": 9999})

    r = await world.client.get(f"{API}/orders/{order['id']}", headers=world.client_h)

    assert r.json()["total_amount"] == 20 * 1500
    assert r.json()["items"][0]["unit_price"] == 1500


# ---------------- Mijoz: tahrirlash / bekor qilish ----------------

@pytest.mark.asyncio
async def test_client_can_edit_pending_order(world):
    order = (await _place(world)).json()

    r = await world.client.put(f"{API}/orders/{order['id']}", headers=world.client_h, json={
        "items": [{"product_id": world.milk["id"], "quantity": 5}], "note": "Ertalab yetkazing",
    })

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_amount"] == 5 * 12000
    assert data["note"] == "Ertalab yetkazing"
    assert [i["product_name"] for i in data["items"]] == ["Sut"]


@pytest.mark.asyncio
async def test_client_can_cancel_pending_order(world):
    order = (await _place(world)).json()

    r = await world.client.post(f"{API}/orders/{order['id']}/cancel", headers=world.client_h)

    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    assert r.json()["cancelled_by"] == "client"
    assert r.json()["can_edit"] is False


@pytest.mark.asyncio
async def test_client_cannot_edit_or_cancel_after_accept(world):
    order = (await _place(world)).json()
    await world.client.post(f"{API}/diller/orders/{order['id']}/accept", headers=world.diller_h)

    edit = await world.client.put(f"{API}/orders/{order['id']}", headers=world.client_h,
                                  json={"items": [{"product_id": world.milk["id"], "quantity": 1}]})
    cancel = await world.client.post(f"{API}/orders/{order['id']}/cancel", headers=world.client_h)

    assert edit.status_code == 409
    assert cancel.status_code == 409


@pytest.mark.asyncio
async def test_client_cannot_touch_someone_elses_order(world, client, session):
    order = (await _place(world)).json()
    _, other_h = await _actor(session, UserRole.USER, "tg_2002", telegram_id=2002)

    assert (await client.get(f"{API}/orders/{order['id']}", headers=other_h)).status_code == 404
    assert (await client.post(f"{API}/orders/{order['id']}/cancel", headers=other_h)).status_code == 404
    assert (await client.put(f"{API}/orders/{order['id']}", headers=other_h,
                             json={"items": [{"product_id": world.eggs["id"], "quantity": 10}]})).status_code == 404


@pytest.mark.asyncio
async def test_my_orders_list_filter_and_pagination(world):
    for _ in range(3):
        await _place(world)
    first = (await world.client.get(f"{API}/orders", headers=world.client_h)).json()["items"][0]
    await world.client.post(f"{API}/orders/{first['id']}/cancel", headers=world.client_h)

    all_orders = (await world.client.get(f"{API}/orders?size=2", headers=world.client_h)).json()
    cancelled = (await world.client.get(f"{API}/orders?status=cancelled", headers=world.client_h)).json()

    assert all_orders["total"] == 3 and all_orders["pages"] == 2 and len(all_orders["items"]) == 2
    assert cancelled["total"] == 1
    # yangi buyurtmalar birinchi
    ids = [o["id"] for o in (await world.client.get(f"{API}/orders", headers=world.client_h)).json()["items"]]
    assert ids == sorted(ids, reverse=True)


# ---------------- Diller ----------------

@pytest.mark.asyncio
async def test_diller_accept_then_deliver(world):
    order = (await _place(world)).json()

    accepted = await world.client.post(f"{API}/diller/orders/{order['id']}/accept", headers=world.diller_h)
    delivered = await world.client.post(f"{API}/diller/orders/{order['id']}/deliver", headers=world.diller_h)

    assert accepted.json()["status"] == "confirmed" and accepted.json()["confirmed_at"]
    assert delivered.json()["status"] == "delivered" and delivered.json()["delivered_at"]


@pytest.mark.asyncio
async def test_diller_reject_records_reason(world):
    order = (await _place(world)).json()

    r = await world.client.post(f"{API}/diller/orders/{order['id']}/reject", headers=world.diller_h,
                                json={"reason": "Tovar tugagan"})

    assert r.json()["status"] == "cancelled"
    assert r.json()["cancelled_by"] == "diller"
    assert r.json()["reject_reason"] == "Tovar tugagan"


@pytest.mark.asyncio
async def test_invalid_transitions_conflict(world):
    order = (await _place(world)).json()
    oid = order["id"]

    # PENDING -> DELIVERED mumkin emas
    assert (await world.client.post(f"{API}/diller/orders/{oid}/deliver", headers=world.diller_h)).status_code == 409
    await world.client.post(f"{API}/diller/orders/{oid}/accept", headers=world.diller_h)
    # ikki marta qabul qilib bo'lmaydi
    assert (await world.client.post(f"{API}/diller/orders/{oid}/accept", headers=world.diller_h)).status_code == 409
    await world.client.post(f"{API}/diller/orders/{oid}/deliver", headers=world.diller_h)
    # yetkazilgan buyurtma o'zgarmaydi
    assert (await world.client.post(f"{API}/diller/orders/{oid}/reject", headers=world.diller_h)).status_code == 409


@pytest.mark.asyncio
async def test_diller_only_sees_own_orders(world, client, session):
    order = (await _place(world)).json()
    await client.post(f"{API}/admin/dillers", headers=world.admin_h, json={
        "username": "diller2", "password": "password123", "full_name": "Ikkinchi",
    })
    login = await client.post(f"{API}/auth/login", json={"username": "diller2", "password": "password123"})
    other_h = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (await client.get(f"{API}/diller/orders/{order['id']}", headers=other_h)).status_code == 404
    assert (await client.post(f"{API}/diller/orders/{order['id']}/accept", headers=other_h)).status_code == 404
    assert (await client.get(f"{API}/diller/orders", headers=other_h)).json()["total"] == 0
    assert (await client.get(f"{API}/diller/orders", headers=world.diller_h)).json()["total"] == 1


@pytest.mark.asyncio
async def test_diller_orders_filter_search_and_dates(world):
    a = (await _place(world)).json()
    b = (await _place(world)).json()
    await world.client.post(f"{API}/diller/orders/{a['id']}/accept", headers=world.diller_h)
    h = world.diller_h

    pending = (await world.client.get(f"{API}/diller/orders?status=pending", headers=h)).json()
    by_shop = (await world.client.get(f"{API}/diller/orders?q=aziz", headers=h)).json()
    by_id = (await world.client.get(f"{API}/diller/orders?q=%23{b['id']}", headers=h)).json()
    nothing = (await world.client.get(f"{API}/diller/orders?q=yoq-bunaqa", headers=h)).json()
    future = (await world.client.get(
        f"{API}/diller/orders?date_from={date.today() + timedelta(days=2)}", headers=h)).json()

    assert pending["total"] == 1 and pending["items"][0]["id"] == b["id"]
    assert by_shop["total"] == 2
    assert by_id["total"] == 1 and by_id["items"][0]["id"] == b["id"]
    assert nothing["total"] == 0
    assert future["total"] == 0


@pytest.mark.asyncio
async def test_order_search_by_id_is_exact(world):
    """'#N' raqam bo'yicha aniq qidiruv: telefon raqamidagi bir xil raqamlarga yopishib qolmasligi kerak."""
    a = (await _place(world)).json()
    b = (await _place(world)).json()
    h = world.diller_h
    # Do'kon telefoni "+998901112233" - ichida "2" ham, "1" ham bor
    assert b["customer_phone"] == "+998901112233"

    by_id = (await world.client.get(f"{API}/diller/orders?q=%23{b['id']}", headers=h)).json()
    other_id = (await world.client.get(f"{API}/diller/orders?q=%23{a['id']}", headers=h)).json()
    unknown = (await world.client.get(f"{API}/diller/orders?q=%23999999", headers=h)).json()
    not_a_number = (await world.client.get(f"{API}/diller/orders?q=%23abc", headers=h)).json()

    assert by_id["total"] == 1 and by_id["items"][0]["id"] == b["id"]
    assert other_id["total"] == 1 and other_id["items"][0]["id"] == a["id"]
    assert unknown["total"] == 0
    assert not_a_number["total"] == 0


@pytest.mark.asyncio
async def test_order_search_survives_oversized_number(world):
    """int4 chegarasidan katta raqam so'rov xatosiga (500) olib kelmasligi kerak."""
    await _place(world)

    huge = await world.client.get(f"{API}/diller/orders?q=99999999999999999999", headers=world.diller_h)
    huge_hash = await world.client.get(f"{API}/diller/orders?q=%2399999999999999999999", headers=world.diller_h)

    assert huge.status_code == 200 and huge.json()["total"] == 0
    assert huge_hash.status_code == 200 and huge_hash.json()["total"] == 0


@pytest.mark.asyncio
async def test_order_search_escapes_wildcards(world):
    """'%' kabi belgilar SQL shabloni sifatida ishlamasligi kerak."""
    await _place(world)

    r = await world.client.get(f"{API}/diller/orders?q=%25", headers=world.diller_h)

    assert r.status_code == 200 and r.json()["total"] == 0


@pytest.mark.asyncio
async def test_diller_clients_and_detail(world, client):
    await _place(world)
    order = (await _place(world)).json()
    await client.post(f"{API}/diller/orders/{order['id']}/accept", headers=world.diller_h)
    await client.post(f"{API}/diller/orders/{order['id']}/deliver", headers=world.diller_h)

    clients = (await client.get(f"{API}/diller/clients", headers=world.diller_h)).json()
    shop_id = clients["items"][0]["shop_id"]
    detail = (await client.get(f"{API}/diller/clients/{shop_id}", headers=world.diller_h)).json()
    search = (await client.get(f"{API}/diller/clients?q=nomavjud", headers=world.diller_h)).json()

    assert clients["total"] == 1
    assert detail["orders_count"] == 2
    assert detail["total_spent"] == 20 * 1500
    assert search["total"] == 0


@pytest.mark.asyncio
async def test_diller_client_of_other_diller_is_404(world, client, session):
    shop_id = (await client.get(f"{API}/diller/clients", headers=world.diller_h)).json()["items"][0]["shop_id"]
    _, other_h = await _actor(session, UserRole.DILLER, "diller_x")

    assert (await client.get(f"{API}/diller/clients/{shop_id}", headers=other_h)).status_code == 404


@pytest.mark.asyncio
async def test_diller_stats_today(world):
    order = (await _place(world)).json()
    await _place(world)
    await world.client.post(f"{API}/diller/orders/{order['id']}/accept", headers=world.diller_h)
    await world.client.post(f"{API}/diller/orders/{order['id']}/deliver", headers=world.diller_h)

    r = await world.client.get(f"{API}/diller/stats?period=today", headers=world.diller_h)

    assert r.status_code == 200, r.text
    t = r.json()["totals"]
    assert t["orders_count"] == 2
    assert t["delivered_count"] == 1
    assert t["sales_amount"] == 30000
    assert t["pending_now"] == 1
    assert t["clients_count"] == 1
    assert r.json()["top_products"][0]["name"] == "Tuxum C1"
    assert r.json()["series"][-1]["sales"] == 30000


@pytest.mark.asyncio
async def test_stats_periods_and_custom_range_validation(world):
    h = world.diller_h
    for period in ("today", "week", "month"):
        assert (await world.client.get(f"{API}/diller/stats?period={period}", headers=h)).status_code == 200

    ok = await world.client.get(f"{API}/diller/stats?period=custom&date_from=2026-01-01&date_to=2026-01-10", headers=h)
    assert ok.status_code == 200 and len(ok.json()["series"]) == 10

    assert (await world.client.get(f"{API}/diller/stats?period=custom", headers=h)).status_code == 422
    assert (await world.client.get(
        f"{API}/diller/stats?period=custom&date_from=2026-02-01&date_to=2026-01-01", headers=h)).status_code == 422
    assert (await world.client.get(
        f"{API}/diller/stats?period=custom&date_from=2020-01-01&date_to=2026-01-01", headers=h)).status_code == 422


@pytest.mark.asyncio
async def test_diller_endpoints_forbidden_for_client_and_admin(world):
    for headers in (world.client_h, world.admin_h):
        assert (await world.client.get(f"{API}/diller/orders", headers=headers)).status_code == 403
        assert (await world.client.get(f"{API}/diller/stats", headers=headers)).status_code == 403


# ---------------- Superadmin ----------------

@pytest.mark.asyncio
async def test_admin_endpoints_forbidden_for_others(world):
    for headers in (world.client_h, world.diller_h):
        assert (await world.client.get(f"{API}/admin/dillers", headers=headers)).status_code == 403
        assert (await world.client.get(f"{API}/admin/orders", headers=headers)).status_code == 403
        assert (await world.client.post(f"{API}/admin/categories", headers=headers, json={"name": "X1"})).status_code == 403
    assert (await world.client.get(f"{API}/admin/dillers")).status_code == 401


@pytest.mark.asyncio
async def test_admin_diller_crud_block_unblock(world):
    c = world.client
    dup = await c.post(f"{API}/admin/dillers", headers=world.admin_h, json={
        "username": "DILLER1", "password": "password123", "full_name": "Dup"})
    assert dup.status_code == 409

    upd = await c.put(f"{API}/admin/dillers/{world.diller['id']}", headers=world.admin_h,
                      json={"region": "Samarqand", "work_hours": "9-18"})
    assert upd.json()["region"] == "Samarqand" and upd.json()["company_name"] == "Bir MChJ"

    blocked = await c.post(f"{API}/admin/dillers/{world.diller['id']}/block", headers=world.admin_h)
    assert blocked.json()["is_blocked"] is True
    # bloklangan diller mavjud tokeni bilan ham, yangi login bilan ham kira olmaydi
    assert (await c.get(f"{API}/diller/orders", headers=world.diller_h)).status_code == 403
    assert (await c.post(f"{API}/auth/login", json={"username": "diller1", "password": "password123"})).status_code == 403

    unblocked = await c.post(f"{API}/admin/dillers/{world.diller['id']}/unblock", headers=world.admin_h)
    assert unblocked.json()["is_blocked"] is False
    assert (await c.get(f"{API}/diller/orders", headers=world.diller_h)).status_code == 200

    listing = (await c.get(f"{API}/admin/dillers?q=bir", headers=world.admin_h)).json()
    assert listing["total"] == 1 and listing["items"][0]["shops_count"] == 1


@pytest.mark.asyncio
async def test_admin_diller_password_change_invalidates_old_password(world):
    c = world.client
    await c.put(f"{API}/admin/dillers/{world.diller['id']}", headers=world.admin_h, json={"password": "newpassword99"})

    old = await c.post(f"{API}/auth/login", json={"username": "diller1", "password": "password123"})
    new = await c.post(f"{API}/auth/login", json={"username": "diller1", "password": "newpassword99"})

    assert old.status_code == 401 and new.status_code == 200


@pytest.mark.asyncio
async def test_admin_users_view_edit_and_reassign(world, client):
    r2 = await client.post(f"{API}/admin/dillers", headers=world.admin_h, json={
        "username": "diller2", "password": "password123", "full_name": "Ikkinchi"})
    diller2 = r2.json()
    order = (await _place(world)).json()
    users = (await client.get(f"{API}/admin/users", headers=world.admin_h)).json()
    uid = users["items"][0]["id"]

    edited = await client.put(f"{API}/admin/users/{uid}", headers=world.admin_h,
                              json={"shop_name": "Yangi nom", "address": "Yangi manzil"})
    assert edited.json()["shop"]["name"] == "Yangi nom"

    moved = await client.post(f"{API}/admin/users/{uid}/reassign", headers=world.admin_h,
                              json={"diller_id": diller2["id"]})
    assert moved.status_code == 200, moved.text
    assert moved.json()["shop"]["diller"]["id"] == diller2["id"]

    # ochiq buyurtma ham yangi dillerga o'tadi
    assert (await client.get(f"{API}/diller/orders/{order['id']}", headers=world.diller_h)).status_code == 404
    order_after = (await client.get(f"{API}/admin/orders/{order['id']}", headers=world.admin_h)).json()
    assert order_after["diller_id"] == diller2["id"]

    same = await client.post(f"{API}/admin/users/{uid}/reassign", headers=world.admin_h,
                             json={"diller_id": diller2["id"]})
    assert same.status_code == 409
    missing = await client.post(f"{API}/admin/users/{uid}/reassign", headers=world.admin_h, json={"diller_id": 99999})
    assert missing.status_code == 422

    filtered = (await client.get(f"{API}/admin/users?diller_id={diller2['id']}", headers=world.admin_h)).json()
    assert filtered["total"] == 1


@pytest.mark.asyncio
async def test_admin_block_user_kicks_them_out(world, client):
    uid = (await client.get(f"{API}/admin/users", headers=world.admin_h)).json()["items"][0]["id"]

    await client.post(f"{API}/admin/users/{uid}/block", headers=world.admin_h)

    assert (await client.get(f"{API}/me", headers=world.client_h)).status_code == 403
    await client.post(f"{API}/admin/users/{uid}/unblock", headers=world.admin_h)
    assert (await client.get(f"{API}/me", headers=world.client_h)).status_code == 200


@pytest.mark.asyncio
async def test_admin_category_crud_and_delete_guard(world, client):
    h = world.admin_h
    dup = await client.post(f"{API}/admin/categories", headers=h, json={"name": "tuxum"})
    assert dup.status_code == 409

    upd = await client.put(f"{API}/admin/categories/{world.cat['id']}", headers=h,
                           json={"name": "Tuxumlar", "sort_order": 3})
    assert upd.json()["name"] == "Tuxumlar" and upd.json()["products_count"] == 2

    assert (await client.delete(f"{API}/admin/categories/{world.cat['id']}", headers=h)).status_code == 409

    empty = (await client.post(f"{API}/admin/categories", headers=h, json={"name": "Bo'sh"})).json()
    assert (await client.delete(f"{API}/admin/categories/{empty['id']}", headers=h)).status_code == 204
    assert (await client.delete(f"{API}/admin/categories/{empty['id']}", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_admin_product_crud(world, client):
    h = world.admin_h
    bad_cat = await client.post(f"{API}/admin/products", headers=h,
                                json={"category_id": 999, "name": "Zzz", "price": 1})
    assert bad_cat.status_code == 422
    external_image = await client.post(f"{API}/admin/products", headers=h, json={
        "category_id": world.cat["id"], "name": "Rasmli", "price": 1, "image_url": "https://evil.example/x.png"})
    assert external_image.status_code == 422
    negative = await client.post(f"{API}/admin/products", headers=h, json={
        "category_id": world.cat["id"], "name": "Manfiy", "price": -5})
    assert negative.status_code == 422

    upd = await client.put(f"{API}/admin/products/{world.milk['id']}", headers=h,
                           json={"price": 13000, "description": "Yangi"})
    assert upd.json()["price"] == 13000 and upd.json()["description"] == "Yangi"

    assert (await client.delete(f"{API}/admin/products/{world.milk['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{API}/admin/products/{world.milk['id']}", headers=h)).status_code == 404
    listing = (await client.get(f"{API}/admin/products", headers=h)).json()
    assert [p["name"] for p in listing["items"]] == ["Tuxum C1"]


@pytest.mark.asyncio
async def test_deleted_product_stays_in_old_orders(world, client):
    order = (await _place(world)).json()
    await client.delete(f"{API}/admin/products/{world.eggs['id']}", headers=world.admin_h)

    r = await client.get(f"{API}/orders/{order['id']}", headers=world.client_h)

    assert r.json()["items"][0]["product_name"] == "Tuxum C1"
    assert (await _place(world)).status_code == 422


def _png(size=(40, 30)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_admin_image_upload(world, client, tmp_path, monkeypatch):
    from app.core.config import config
    monkeypatch.setattr(config, "upload_dir", str(tmp_path))

    ok = await client.post(f"{API}/admin/uploads/image", headers=world.admin_h,
                           files={"file": ("a.png", _png(), "image/png")})
    assert ok.status_code == 200, ok.text
    assert ok.json()["url"].startswith("/uploads/product/") and ok.json()["url"].endswith(".png")
    assert len(list((tmp_path / "product").iterdir())) == 1

    fake = await client.post(f"{API}/admin/uploads/image", headers=world.admin_h,
                             files={"file": ("a.png", b"<script>alert(1)</script>", "image/png")})
    assert fake.status_code == 422

    huge = await client.post(f"{API}/admin/uploads/image", headers=world.admin_h,
                             files={"file": ("a.png", b"0" * (5 * 1024 * 1024 + 10), "image/png")})
    assert huge.status_code == 413

    forbidden = await client.post(f"{API}/admin/uploads/image", headers=world.client_h,
                                  files={"file": ("a.png", _png(), "image/png")})
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_admin_manage_orders(world, client):
    a = (await _place(world)).json()
    b = (await _place(world)).json()
    h = world.admin_h

    ok = await client.post(f"{API}/admin/orders/{a['id']}/status", headers=h, json={"status": "confirmed"})
    assert ok.json()["status"] == "confirmed"
    bad = await client.post(f"{API}/admin/orders/{a['id']}/status", headers=h, json={"status": "pending"})
    assert bad.status_code == 409
    cancelled = await client.post(f"{API}/admin/orders/{b['id']}/status", headers=h,
                                  json={"status": "cancelled", "reason": "Admin bekor qildi"})
    assert cancelled.json()["cancelled_by"] == "superadmin"

    by_status = (await client.get(f"{API}/admin/orders?status=confirmed", headers=h)).json()
    by_diller = (await client.get(f"{API}/admin/orders?diller_id={world.diller['id']}", headers=h)).json()
    assert by_status["total"] == 1 and by_diller["total"] == 2
    assert (await client.get(f"{API}/admin/orders/999999", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_admin_stats_include_top_dillers(world, client):
    order = (await _place(world)).json()
    await client.post(f"{API}/admin/orders/{order['id']}/status", headers=world.admin_h, json={"status": "confirmed"})
    await client.post(f"{API}/admin/orders/{order['id']}/status", headers=world.admin_h, json={"status": "delivered"})

    r = await client.get(f"{API}/admin/stats?period=month", headers=world.admin_h)

    assert r.status_code == 200, r.text
    assert r.json()["totals"]["sales_amount"] == 30000
    assert r.json()["top_dillers"][0]["name"] == "Bir MChJ"


# ---------------- Auth ----------------

@pytest.mark.asyncio
async def test_refresh_token_flow(world, client):
    login = (await client.post(f"{API}/auth/login", json={"username": "diller1", "password": "password123"})).json()

    refreshed = await client.post(f"{API}/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert refreshed.status_code == 200
    new = refreshed.json()

    # eski refresh token (rotation) endi ishlamaydi
    reuse = await client.post(f"{API}/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert reuse.status_code == 401
    # access token refresh o'rnida ishlamaydi
    wrong_type = await client.post(f"{API}/auth/refresh", json={"refresh_token": new["access_token"]})
    assert wrong_type.status_code == 401
    # refresh token API'da access o'rnida ishlamaydi
    as_access = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {new['refresh_token']}"})
    assert as_access.status_code == 401


@pytest.mark.asyncio
async def test_login_wrong_password(world, client):
    r = await client.post(f"{API}/auth/login", json={"username": "diller1", "password": "wrong"})

    assert r.status_code == 401


@pytest.mark.asyncio
async def test_legacy_token_endpoint_still_works(world, client):
    r = await client.post("/token", data={"username": "diller1", "password": "password123"})

    assert r.status_code == 200
    assert r.json()["role"] == "diller"
