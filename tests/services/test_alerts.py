"""Server xatoliklari haqidagi Telegram xabarlari (Slack o'rniga)."""
import pytest
from starlette.requests import Request

from app.api import global_exception_handler
from app.services import alerts


def _boom(message: str = "nimadir buzildi") -> Exception:
    try:
        raise ValueError(message)
    except ValueError as exc:
        return exc


@pytest.fixture
def sent(monkeypatch):
    """Yuborilgan xabarlarni to'playdi va haqiqiy Telegram chaqiruvini to'sadi."""
    captured: list[tuple[int, str]] = []

    async def fake_send(chat_id, text):
        captured.append((chat_id, text))

    monkeypatch.setattr(alerts, "send_telegram_message", fake_send)
    monkeypatch.setattr(alerts, "_last_sent", {})
    monkeypatch.setattr(alerts.config.telegram, "alert_chat_ids", [111, 222])
    monkeypatch.setattr(alerts.config.telegram, "alert_throttle_seconds", 300)
    return captured


@pytest.mark.asyncio
async def test_alert_goes_to_every_admin(sent):
    await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")

    assert [chat_id for chat_id, _ in sent] == [111, 222]
    assert "ValueError" in sent[0][1]
    assert "GET /api/v1/orders" in sent[0][1]


@pytest.mark.asyncio
async def test_repeated_error_is_throttled(sent):
    for _ in range(5):
        await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")

    # 2 ta admin x 1 xabar: qolgan 4 urinish cheklovga tushadi
    assert len(sent) == 2


@pytest.mark.asyncio
async def test_different_path_or_type_is_not_throttled(sent):
    await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")
    await alerts.send_error_alert(_boom(), "GET", "/api/v1/products")
    await alerts.send_error_alert(KeyError("boshqa"), "GET", "/api/v1/orders")

    assert len(sent) == 6  # 3 xil xatolik x 2 admin


@pytest.mark.asyncio
async def test_throttle_expires(sent, monkeypatch):
    monkeypatch.setattr(alerts.config.telegram, "alert_throttle_seconds", 0)

    await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")
    await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")

    assert len(sent) == 4


@pytest.mark.asyncio
async def test_no_admins_means_no_alert(sent, monkeypatch):
    monkeypatch.setattr(alerts.config.telegram, "alert_chat_ids", [])

    await alerts.send_error_alert(_boom(), "GET", "/api/v1/orders")

    assert sent == []


@pytest.mark.asyncio
async def test_html_in_error_is_escaped(sent):
    """Xatolik matni HTML sifatida talqin qilinib, Telegram xabarini buzmasligi kerak."""
    await alerts.send_error_alert(_boom("<script>alert(1)</script>"), "GET", "/x")

    text = sent[0][1]
    assert "<script>" not in text
    assert "&lt;script&gt;" in text


def test_message_stays_within_telegram_limit():
    deep = _boom("x" * 5000)

    message = alerts.build_message(deep, "POST", "/api/v1/orders")

    assert len(message) < 4096


# ---------- main.py bilan ulanish ----------

@pytest.mark.asyncio
async def test_handler_returns_500_and_schedules_alert_in_background(monkeypatch):
    """Xabar javob bilan birga emas, fon vazifasi sifatida ketishi kerak:
    aks holda mijoz Telegram javobini kutib turadi."""
    monkeypatch.setattr(alerts.config, "debug", False)
    scope = {"type": "http", "method": "POST", "path": "/api/v1/orders", "headers": []}

    response = await global_exception_handler(Request(scope), _boom())

    assert response.status_code == 500
    assert b"Serverda kutilmagan xatolik" in response.body
    assert response.background is not None
    assert response.background.func is alerts.send_error_alert
