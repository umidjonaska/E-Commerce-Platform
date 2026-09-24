# SupplyLink

Dillerlar orqali ishlaydigan B2B buyurtma platformasi. Do'kon egalari Telegram Mini App
orqali mahsulot buyurtma qiladi, dillerlar buyurtmalarni qabul qilib yetkazadi,
administrator esa butun tizimni boshqaradi.

```
Do'kon egasi  ──(Telegram Mini App)──▶  Buyurtma  ──▶  Diller  ──▶  Yetkazib berish
                                            │
                                            └──▶  SUPERADMIN (katalog, dillerlar, statistika)
```

---

## Tarkib

| Qism | Texnologiya | Joylashuv |
|---|---|---|
| Backend API | FastAPI, SQLAlchemy 2.0 (async), Alembic | `app/` |
| Frontend | React 19, TypeScript, Vite, TanStack Query | `web/` |
| Telegram bot | aiogram 3 | `bot/` |
| Ma'lumotlar bazasi | PostgreSQL 16 | `migrations/` |
| Testlar | pytest (131 ta) | `tests/` |

---

## Rollar

| Rol | Kirish usuli | Nima qila oladi |
|---|---|---|
| **Mijoz** (`user`) | Telegram Mini App | Ro'yxatdan o'tish, katalog, savat, buyurtma berish/tahrirlash/bekor qilish |
| **Diller** (`diller`) | Login + parol | Buyurtmalarni qabul qilish/rad etish/yetkazish, o'z mijozlari, statistika |
| **Administrator** (`superadmin`) | Login + parol | Dillerlar, mijozlar, katalog, barcha buyurtmalar, statistika |

Rol tizimga kirgandan keyin avtomatik aniqlanadi va foydalanuvchi o'z bo'limiga yo'naltiriladi.

---

## Buyurtma hayot sikli

```
PENDING ──▶ CONFIRMED ──▶ DELIVERED
   │            │
   └────────────┴──▶ CANCELLED
```

* Mijoz buyurtmani faqat **PENDING** holatida tahrirlaydi yoki bekor qiladi.
* Diller: `PENDING → CONFIRMED | CANCELLED`, `CONFIRMED → DELIVERED | CANCELLED`.
* Yetkazilgan va bekor qilingan buyurtma o'zgarmaydi.
* **Narx va jami summa doim serverda hisoblanadi** — klient yuborgan narxga ishonilmaydi.
* Buyurtma tarkibiga mahsulot nomi va narxi nusxa (snapshot) sifatida yoziladi, shuning
  uchun keyinchalik katalog o'zgarsa ham eski buyurtma o'zgarmaydi.

---

## Tezkor ishga tushirish (Docker)

Butun tizim — baza, backend, frontend va bot — bitta buyruq bilan ko'tariladi.

**1. Sozlamalarni tayyorlang**

```bash
cp .env.example .env
```

`.env` faylida kamida quyidagilarni to'ldiring:

| Kalit | Izoh |
|---|---|
| `SECRET_KEY` | Tasodifiy, kamida 32 belgi (quyida buyruq bor) |
| `DB_PASSWORD` | Baza paroli (ixtiyoriy, lekin bo'sh bo'lmasin) |
| `DB_HOST` | Docker uchun `postgres` |
| `BOT_TOKEN` | @BotFather bergan token |
| `WEBAPP_URL` | Mini App manzili, **https://** bilan |

`SECRET_KEY` yaratish:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**2. Ishga tushiring**

```bash
docker compose up -d --build
```

Bu: PostgreSQL'ni ko'taradi, migratsiyalarni bajaradi, backend, frontend (nginx)
va botni ishga tushiradi.

**3. Administrator yarating**

```bash
docker compose exec backend python -m app.scripts.create_superadmin --username admin
```

Parol so'raladi (kamida 10 belgi). Parol kodga yozilmaydi.

**4. Oching**

| Manzil | Nima |
|---|---|
| http://localhost:5173 | Frontend (login sahifasi) |
| http://localhost:8000/docs | Swagger API hujjati |

Administrator sifatida kirib, ketma-ketlik bo'yicha to'ldiring:
**Dillerlar** → **Kategoriyalar** → **Mahsulotlar**. Shundan keyin mijozlar Mini App orqali
ro'yxatdan o'tib, buyurtma bera oladi.

---

## Lokal ishlab chiqish (Docker'siz)

Talablar: Python 3.12, Node.js 20+, PostgreSQL 16+.

**Backend**

```bash
python -m venv venv && venv\Scripts\activate
```

```bash
pip install -r requirements.txt
```

`.env` da `DB_HOST=127.0.0.1` qiling, so'ng bazani yarating va migratsiyalarni bajaring:

```bash
psql -U postgres -c "CREATE DATABASE supplylink"
```

```bash
alembic upgrade head
```

```bash
python -m app.scripts.create_superadmin --username admin
```

```bash
python -m uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd web && npm install && npm run dev
```

Vite `/api` va `/uploads` so'rovlarini backendga uzatadi, shuning uchun brauzer uchun
hammasi bitta origin bo'lib ko'rinadi va CORS muammosi chiqmaydi.

Backend boshqa portda bo'lsa:

```bash
VITE_API_PROXY=http://127.0.0.1:8001 npm run dev
```

**Bot**

```bash
python -m bot.main
```

> Bot bir vaqtda faqat **bitta** joyda ishlashi kerak. Docker'dagisi ishlayotgan bo'lsa,
> avval `docker compose stop bot` qiling — aks holda Telegram `TelegramConflictError` beradi.

---

## Bulutga joylashtirish

Vercel (frontend) + Render (backend) + Neon (baza) uchun qadamma-qadam
qo'llanma: **[DEPLOY.md](DEPLOY.md)**.

Tayyor konfiguratsiya fayllari: `render.yaml` (Render Blueprint) va
`web/vercel.json` (SPA fallback hamda `/api`, `/uploads` proxy'si).

---

## Telegram Mini App

1. @BotFather'da bot yarating, tokenni `.env` dagi `BOT_TOKEN` ga qo'ying.
2. Frontendni **HTTPS** domenda joylashtiring (Telegram `http://` va `localhost` ni qabul qilmaydi).
3. `.env` da `WEBAPP_URL=https://sizning-domeningiz` deb yozing.
4. @BotFather → `/setmenubutton` orqali Mini App manzilini ulang.

Autentifikatsiya Telegram `initData` imzosini backendda HMAC-SHA256 bilan tekshirish orqali
amalga oshiriladi (`app/services/telegram_auth.py`). Imzo yaroqsiz yoki eskirgan bo'lsa kirish rad etiladi.

`WEBAPP_URL` sozlanmagan bo'lsa bot yiqilmaydi — shunchaki Mini App tugmasini ko'rsatmaydi
va logda nima qilish kerakligini yozadi.

### Lokal sinov (HTTPS'siz)

Telegram `http://localhost` ni qabul qilmaydi. Lokal frontendni Telegram ichida sinash uchun
tunnel oching:

```bash
cloudflared tunnel --url http://localhost:5173
```

Buyruq bergan `https://...trycloudflare.com` manzilini `.env` dagi `WEBAPP_URL` ga yozing va
botni qayta ishga tushiring:

```bash
docker compose up -d bot
```

---

## Loyiha tuzilmasi

```text
├── app/                        # FastAPI backend
│   ├── api.py                  # Ilova TO'LIQ shu yerda yig'iladi (router, middleware, xatoliklar)
│   ├── main.py                 # uvicorn uchun kirish nuqtasi
│   ├── deps.py                 # Dependency injection
│   ├── auth/                   # JWT, parol, rol tekshiruvi
│   ├── core/                   # config, bazaviy sinflar, xatolik javoblari
│   ├── database/               # Async engine va sessiya
│   ├── models/                 # SQLAlchemy modellari
│   │   └── user.py  shop.py  catalog.py  order.py
│   ├── schemas/                # Pydantic sxemalari
│   ├── repositories/           # Ma'lumotlar bazasi so'rovlari
│   ├── services/               # Biznes mantiq
│   │   ├── order.py            # Buyurtma qoidalari, holat o'tishlari
│   │   ├── catalog.py          # Kategoriya va mahsulotlar
│   │   ├── admin.py            # Diller/mijoz boshqaruvi
│   │   ├── stats.py            # Statistika (SQL agregatsiya)
│   │   ├── telegram_auth.py    # initData imzosini tekshirish
│   │   ├── notify.py           # Telegram bildirishnomalari
│   │   ├── alerts.py           # Server xatoliklari haqida xabar
│   │   └── uploads.py          # Rasm yuklash va tekshirish
│   ├── routes/v1/              # SupplyLink API
│   │   ├── auth.py  me.py  catalog.py  orders.py  diller.py  admin.py
│   └── scripts/                # create_superadmin
│
├── web/                        # React frontend
│   └── src/
│       ├── app/                # Telegram Mini App (mijoz)
│       ├── diller/             # Diller kabineti
│       ├── admin/              # SUPERADMIN paneli
│       ├── components/         # UI kutubxonasi, layout, umumiy bloklar
│       ├── lib/                # API klienti, Telegram, formatlash
│       ├── store/              # Auth va bildirishnomalar
│       └── styles/             # Design tokenlar
│
├── bot/                        # Telegram bot (Mini App kirish nuqtasi)
├── migrations/                 # Alembic migratsiyalari
├── tests/                      # pytest (213 ta test)
└── docker-compose.yml
```

---

## API

To'liq hujjat: http://localhost:8000/docs

Asosiy yo'llar `/api/v1` ostida:

| Guruh | Yo'l | Kim uchun |
|---|---|---|
| Auth | `POST /auth/telegram`, `/auth/login`, `/auth/refresh` | Hamma |
| Profil | `GET /me`, `POST|PUT /me/shop`, `GET /dillers` | Mijoz |
| Katalog | `GET /categories`, `/products` | Mijoz |
| Buyurtmalar | `POST|GET /orders`, `PUT /orders/{id}`, `POST /orders/{id}/cancel` | Mijoz |
| Diller | `/diller/orders`, `/diller/clients`, `/diller/stats` | Diller |
| Admin | `/admin/dillers`, `/admin/users`, `/admin/categories`, `/admin/products`, `/admin/orders`, `/admin/stats` | Superadmin |

Avtorizatsiya `Authorization: Bearer <access_token>` sarlavhasi orqali. Access token 30 daqiqa
yashaydi, muddati tugasa frontend uni `refresh_token` bilan avtomatik yangilaydi.

---

## Testlar

```bash
pytest
```

Testlar haqiqiy PostgreSQL bazasiga ulanadi (`tests/conftest.py` dagi `supplylink_test`).
Har bir test uchun jadvallar qaytadan yaratilib, oxirida o'chiriladi.

```bash
cd web && npm run typecheck
```

---

## Xavfsizlik

* Parollar **argon2** bilan xeshlanadi; refresh token bazada SHA-256 xeshi sifatida saqlanadi.
* Access va refresh tokenlar `typ` claim bilan ajratilgan — refresh tokenni access sifatida
  ishlatib bo'lmaydi.
* Rol va bloklash **har bir so'rovda** bazadan tekshiriladi, shuning uchun foydalanuvchini
  bloklash darhol kuchga kiradi.
* Yuklangan rasmlar turi, hajmi va haqiqiyligi tekshiriladi; EXIF ma'lumotlari olib tashlanadi.
* Ommaviy `uploads/` papkasi shaxsiy `media/` papkasidan ajratilgan.
* Productionda `DEBUG=False` bo'lishi shart — aks holda xatolik matni mijozga qaytariladi.

---

## Sozlamalar

Barcha kalitlar va ularning izohi `.env.example` faylida. Eng muhimlari:

| Kalit | Standart | Izoh |
|---|---|---|
| `DEBUG` | `False` | Productionda albatta `False` |
| `SECRET_KEY` | — | Majburiy, kamida 32 belgi |
| `APP_TIMEZONE` | `Asia/Tashkent` | "Bugun", "shu hafta" chegaralari |
| `UPLOAD_DIR` | `uploads` | Mahsulot rasmlari |
| `ALLOWED_ORIGINS` | `localhost:5173` | Vergul bilan; nginx orqali kerak emas |
| `ADMIN_CHAT_IDS` | — | Server xatoliklari shu chatlarga yuboriladi |
| `NOTIFY_ENABLED` | `True` | Telegram bildirishnomalari |

---

## Muallif

**Umidjon Askaraliev** — https://github.com/umidjonaska

MIT litsenziyasi.
