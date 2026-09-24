import json

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status

from app.services.telegram_webhook import WEBHOOK_PATH, telegram_webhook, webhook_enabled

router = APIRouter()


@router.post(WEBHOOK_PATH, include_in_schema=False)
async def telegram_webhook_endpoint(
    request: Request,
    background: BackgroundTasks,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    if not webhook_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not telegram_webhook.verify(x_telegram_bot_api_secret_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruxsat yo'q")
    if not telegram_webhook.ready:
        # 2xx bo'lmagan javobdan keyin Telegram update'ni keyinroq qayta yuboradi
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot hali tayyor emas")

    try:
        data = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON kutilgan edi")

    # Telegram tez javob kutadi: update javob yuborilgandan keyin qayta ishlanadi
    background.add_task(telegram_webhook.process, data)
    return {"ok": True}
