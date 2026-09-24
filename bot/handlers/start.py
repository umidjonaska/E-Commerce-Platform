from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from bot.config import config
from bot.keyboards.order import webapp_keyboard

router = Router()

WELCOME = (
    "Assalomu alaykum! 👋\n\n"
    "Bu bot orqali do'koningiz uchun buyurtma berishingiz mumkin.\n"
    "Quyidagi tugmani bosing — katalog, savat va buyurtmalaringiz shu yerda."
)

NOT_CONFIGURED = (
    "Assalomu alaykum! 👋\n\n"
    "Ilova hozircha sozlanmoqda. Iltimos, birozdan keyin qayta urinib ko'ring."
)

HELP = (
    "<b>Yordam</b>\n\n"
    "/start — ilovani ochish\n"
    "/help — shu xabar\n\n"
    "Buyurtma berish, tahrirlash va bekor qilish — hammasi ilova ichida.\n"
    "Buyurtma holati o'zgarganda sizga shu yerda xabar keladi."
)


async def _send(message: Message, text: str) -> None:
    keyboard = webapp_keyboard()
    await message.answer(text if keyboard else NOT_CONFIGURED, reply_markup=keyboard)


@router.message(CommandStart())
async def cmd_start(message: Message):
    await _send(message, WELCOME)


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(HELP, reply_markup=webapp_keyboard())


@router.message(Command("order", "orders"))
async def cmd_order(message: Message):
    """Eski /order buyrug'i endi Mini App'ni ochadi."""
    await _send(message, "Buyurtma berish uchun ilovani oching 👇")
