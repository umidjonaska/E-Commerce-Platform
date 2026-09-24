# SupplyLink — Deploy qo'llanmasi

Bu hujjat loyihani noldan bulutga chiqarishni qadamma-qadam tushuntiradi.

---

## 1. Arxitektura: nima qayerga joylashadi

Loyihada to'rtta komponent bor va ularning har biri boshqa turdagi xizmat talab qiladi:

| Komponent | Nima u | Qayerga | Bepulmi |
|---|---|---|---|
| **Frontend** (`web/`) | Statik React SPA — Mini App, diller va admin panellari | **Vercel** | Ha |
| **Backend** (`app/`) | FastAPI, doim ishlab turishi kerak | **Render** (Web Service) | Ha, cheklovlar bilan |
| **Baza** | PostgreSQL | **Neon** | Ha |
| **Bot** (`bot/`) | Telegram `/start` ishlovchisi | Render Worker yoki webhook | Pullik / muqobil bor |

### Neon haqidagi savolga javob

**Neon — bot uchun emas, baza uchun.** Neon.tech serverless PostgreSQL xizmati, ya'ni u `docker-compose.yml` dagi `postgres` servisining bulutdagi o'rnini bosadi. Botni u yerga joylashtirib bo'lmaydi.

**Mini App'ni alohida joylashtirish shart emas.** Mini App — bu aynan `web/` frontendning o'zi. Telegram uni oddiy brauzer oynasida ochadi. Ya'ni Vercel'ga chiqarilgan domenni BotFather'ga Mini App URL sifatida berasiz, tamom. Alohida hosting kerak emas.

**Bot jarayoni** esa alohida masala — 6-qadamda uchta variant berilgan.

```
Telegram foydalanuvchi
      |
      +-- /start --------------> bot (Render Worker / webhook)
      |
      +-- Mini App tugmasi ----> Vercel (React SPA)
                                      |
                                      | /api/v1/*  va  /uploads/*
                                      v
                                 Render (FastAPI)
                                      |
                                      v
                                  Neon (PostgreSQL)
```

> **Eslatma:** men sizning Vercel va Render hisoblaringizga kira olmayman, shuning uchun tugmani siz bosasiz. Barcha konfiguratsiya fayllari (`web/vercel.json`, `render.yaml`) tayyorlab repoga qo'yildi — quyidagi qadamlar asosan "import qilish va o'zgaruvchilarni kiritish" dan iborat.

---

## 2-qadam. Neon — ma'lumotlar bazasi

Birinchi baza, chunki backend'ga uning manzili kerak bo'ladi.

1. [neon.tech](https://neon.tech) ga kiring, **Sign up with GitHub**.
2. **Create project**:
   - Project name: `supplylink`
   - Postgres version: 17 (yoki eng oxirgisi)
   - Region: **Europe (Frankfurt)** — O'zbekistonga eng yaqin variant
3. Yaratilgandan keyin **Connection string** ko'rsatiladi. **Pooled** emas, **Direct connection** ni tanlang (Alembic migratsiyalari pooler bilan muammo berishi mumkin).
4. Satrni nusxalang. U shunday ko'rinadi:

```
postgresql://supplylink_owner:AbC123xyz@ep-cool-forest-a2b3c4.eu-central-1.aws.neon.tech/supplylink?sslmode=require
```

5. Bu satrni saqlab qo'ying — keyingi qadamda `DATABASE_URL` sifatida kerak bo'ladi.

> Kod endi `DATABASE_URL` ni tushunadi va uni avtomatik `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` ga ajratadi. Qo'lda ajratib yozish shart emas.

---

## 3-qadam. Render — backend

### 3.1. Servisni yaratish

1. [render.com](https://render.com) → **Sign up with GitHub**.
2. **New** → **Blueprint**.
3. `umidjonaska/E-Commerce-Platform` repositoriysini tanlang.
4. Render repodagi `render.yaml` ni o'qib, ikkita servisni taklif qiladi:
   - `supplylink-api` (web)
   - `supplylink-bot` (worker)

   **Bepul rejada worker ishlamaydi.** Agar hozir to'lov qilmoqchi bo'lmasangiz, `supplylink-bot` ni ro'yxatdan chiqarib tashlang (yoki `render.yaml` dagi ikkinchi servis blokini olib tashlang) va 6-qadamdagi muqobil variantdan foydalaning.

### 3.2. Muhit o'zgaruvchilari

Render `sync: false` belgilangan o'zgaruvchilarni sizdan so'raydi:

| O'zgaruvchi | Qiymat |
|---|---|
| `DATABASE_URL` | Neon'dan olingan satr (2-qadam) |
| `BOT_TOKEN` | @BotFather bergan token |
| `ALLOWED_ORIGINS` | Vercel domeni, masalan `https://supplylink.vercel.app` |
| `WEBAPP_URL` | xuddi shu Vercel domeni |
| `ADMIN_CHAT_IDS` | xatolik xabarlari keladigan Telegram chat ID (ixtiyoriy) |

`SECRET_KEY` avtomatik generatsiya qilinadi (`generateValue: true`), qo'lda kiritish shart emas.

> **Muhim:** Vercel domenini hali bilmaysiz. Hozir vaqtincha `https://example.com` yozib qo'ying, 4-qadamdan keyin qaytib to'g'rilaysiz.

### 3.3. Plan tanlash

- **Free** — 512 MB RAM, 15 daqiqa harakatsizlikdan keyin uxlaydi, uyg'onishi ~50 soniya. Sinov uchun yetarli, haqiqiy mijozlar uchun emas.
- **Starter (~$7/oy)** — uxlamaydi, disk ulash mumkin. Haqiqiy foydalanish uchun shu.

### 3.4. Deploy

**Create** ni bosing. Render Docker image quradi (~5–8 daqiqa), so'ng `dockerCommand` ishga tushadi:

```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Ya'ni migratsiyalar **avtomatik** qo'llanadi — Neon bazasi bo'sh bo'lsa ham jadvallar o'zi yaratiladi.

### 3.5. Tekshirish

```bash
curl https://supplylink-api.onrender.com/health
```

`{"status":"ok"}` qaytishi kerak. Swagger: `https://supplylink-api.onrender.com/docs`

---

## 4-qadam. Vercel — frontend

1. [vercel.com](https://vercel.com) → **Sign up with GitHub**.
2. **Add New** → **Project** → `E-Commerce-Platform` ni **Import**.
3. Sozlamalar oynasida **faqat bitta narsani** o'zgartirasiz:

   | Maydon | Qiymat |
   |---|---|
   | **Root Directory** | `web` ← **buni albatta o'zgartiring** |
   | Framework Preset | Vite (avtomatik aniqlanadi) |
   | Build Command | `npm run build` (avtomatik) |
   | Output Directory | `dist` (avtomatik) |

   Root Directory'ni `web` qilmasangiz, Vercel repo ildizida `package.json` topolmay xato beradi.

4. **Deploy**. ~2 daqiqada tayyor bo'ladi, masalan `https://supplylink.vercel.app`.

### 4.1. Backend manzilini to'g'rilash

`web/vercel.json` da backend manzili yozilgan:

```json
{ "source": "/api/:path*", "destination": "https://supplylink-api.onrender.com/api/:path*" }
```

Agar Render'dagi servis nomingiz `supplylink-api` dan boshqacha bo'lsa, `web/vercel.json` dagi **ikkala** `destination` ni o'z manzilingizga almashtiring va commit qiling — Vercel avtomatik qayta deploy qiladi.

> **Nega proxy?** Shu tufayli brauzer uchun frontend ham, API ham bitta domen bo'lib ko'rinadi. Natijada CORS muammosi chiqmaydi va backend qaytaradigan `/uploads/products/x.webp` kabi nisbiy rasm manzillari o'zgarishsiz ishlayveradi.

### 4.2. Render'dagi o'zgaruvchilarni yangilash

Endi Vercel domeni ma'lum. Render → `supplylink-api` → **Environment**:

- `ALLOWED_ORIGINS` = `https://supplylink.vercel.app`
- `WEBAPP_URL` = `https://supplylink.vercel.app`

**Save** → Render avtomatik qayta ishga tushadi.

---

## 5-qadam. SUPERADMIN yaratish

Render'ning bepul rejasida Shell yo'q. Shuning uchun skriptni **o'z kompyuteringizdan** Neon bazasiga ulanib ishga tushirasiz:

```bash
DATABASE_URL="postgresql://...neon.tech/supplylink?sslmode=require" ./venv/Scripts/python.exe -m app.scripts.create_superadmin --username umidjon
```

Parol so'raladi (kamida 10 belgi). Shundan keyin `https://supplylink.vercel.app` ga o'sha login/parol bilan kirasiz.

---

## 6-qadam. Bot

Bot `/start` buyrug'iga javob beradi va Mini App tugmasini ko'rsatadi. Buyurtma bildirishnomalarini **backend** o'zi yuboradi, shuning uchun bot jarayoni to'xtasa ham buyurtmalar ishlayveradi.

### Variant A — Render Worker (eng ishonchli, ~$7/oy)

`render.yaml` da allaqachon tayyor. `supplylink-bot` servisini Blueprint'dan yarating, `BOT_TOKEN` va `WEBAPP_URL` ni kiriting. Boshqa hech narsa kerak emas.

### Variant B — Botsiz, faqat BotFather (butunlay bepul)

Mini App tugmasini bot jarayonisiz ham sozlash mumkin:

1. Telegram'da [@BotFather](https://t.me/BotFather) ni oching
2. `/mybots` → botingiz → **Bot Settings** → **Menu Button** → **Configure menu button**
3. URL: `https://supplylink.vercel.app`, matn: `Buyurtma`

Shundan keyin foydalanuvchi chatdagi menyu tugmasi orqali Mini App'ni ochadi. **Kamchiligi:** `/start` yozilganda bot javob bermaydi.

### Variant C — Webhook rejimi (bepul, lekin kod qo'shish kerak)

Botni alohida servis sifatida emas, backend ichida webhook orqali ishlatish mumkin — o'shanda qo'shimcha to'lov kerak bo'lmaydi. Buning uchun `app/` ga kichik webhook endpoint qo'shish talab qilinadi (hozir yozilmagan). Bepul rejada backend uxlab qolgani uchun birinchi `/start` ga javob ~50 soniya kechikadi.

**Tavsiya:** sinov bosqichida **Variant B**, haqiqiy ishga tushirishda **Variant A**.

---

## 7-qadam. Telegram Mini App'ni ro'yxatdan o'tkazish

1. @BotFather → `/mybots` → botingiz → **Bot Settings** → **Menu Button** → URL: `https://supplylink.vercel.app`
2. (Ixtiyoriy) `/newapp` orqali Mini App yaratib, unga nom, tavsif va rasm bering.

Telegram **faqat HTTPS** manzilni qabul qiladi — Vercel domeni allaqachon HTTPS, shuning uchun qo'shimcha sozlash kerak emas.

---

## 8-qadam. Yakuniy tekshiruv ro'yxati

| # | Tekshirish | Kutilgan natija |
|---|---|---|
| 1 | `curl .../health` | `{"status":"ok"}` |
| 2 | Vercel domenini brauzerda ochish | Login sahifasi chiqadi |
| 3 | SUPERADMIN bilan kirish | Dashboard ochiladi |
| 4 | Kategoriya va mahsulot qo'shish | Ro'yxatda ko'rinadi |
| 5 | Mahsulotga rasm yuklash | Rasm ko'rinadi |
| 6 | Diller yaratish, unga kirish | Diller paneli ochiladi |
| 7 | Telegram'da botga `/start` | Mini App tugmasi chiqadi |
| 8 | Mini App'da buyurtma berish | Buyurtma yaratiladi |
| 9 | Diller panelida buyurtmani qabul qilish | Status `CONFIRMED` bo'ladi |
| 10 | Brauzer konsoli (F12) | Xato yo'q |

---

## 9. Cheklovlar va xarajatlar

### Bepul rejaning kamchiliklari

| Muammo | Sabab | Yechim |
|---|---|---|
| **Birinchi ochilish ~50 soniya** | Render free 15 daqiqadan keyin uxlaydi | Starter rejaga o'tish (~$7/oy) |
| **Mahsulot rasmlari yo'qoladi** | Render free'da disk vaqtinchalik, har deploy'da tozalanadi | Starter + Disk, yoki Cloudflare R2 / S3 |
| **Baza ham uxlaydi** | Neon free avtomatik to'xtaydi | Birinchi so'rov ~0.5 soniya sekin — jiddiy emas |
| **Bot ishlamaydi** | Worker bepul emas | Variant B yoki A |

> **Rasmlar haqida ogohlantirish:** bepul Render'da fayl tizimi har deploy'da nolga qaytadi. `render.yaml` da `disk` bloki va `UPLOAD_DIR=/var/data/uploads` yozilgan — bu **faqat pullik rejada** ishlaydi. Bepul rejada bo'lsangiz, `render.yaml` dan `disk` blokini va `UPLOAD_DIR` o'zgaruvchisini olib tashlang; rasmlar vaqtincha saqlanadi, lekin har yangilanishda yo'qoladi.

### Taxminiy oylik xarajat

| Konfiguratsiya | Narx |
|---|---|
| To'liq bepul (sinov uchun) | **$0** — sekin, rasmlar yo'qoladi, bot cheklangan |
| Backend Starter + bepul baza va frontend | **~$7** — rasmlar saqlanadi, uxlamaydi |
| Backend + Bot Worker | **~$14** |
| Yuqoridagilar + Neon Launch | **~$33** — jiddiy foydalanish uchun |

Narxlar o'zgarib turadi — to'lovdan oldin Render va Neon saytlaridagi joriy tariflarni tekshiring.

> **Vercel litsenziyasi:** bepul **Hobby** rejasi tijorat loyihalari uchun mo'ljallanmagan. Platformadan haqiqiy savdo uchun foydalansangiz, Vercel **Pro** ga o'tish (~$20/oy) yoki frontendni Render'ning bepul statik hostingiga joylashtirish kerak bo'ladi.

---

## 10. Tez-tez uchraydigan muammolar

**Brauzer konsolida CORS xatosi**
`web/vercel.json` dagi proxy tufayli CORS umuman chiqmasligi kerak. Chiqayotgan bo'lsa, `vercel.json` dagi `destination` manzili noto'g'ri yoki Root Directory `web` qilib belgilanmagan.

**Vercel'da `404: NOT_FOUND` sahifani yangilaganda**
`vercel.json` dagi oxirgi rewrite (`/(.*)` → `/index.html`) SPA yo'llarini ushlab turadi. Xato chiqsa — Root Directory `web` ekanini tekshiring.

**Render loglarida `SECRET_KEY production uchun kamida 32 belgidan iborat bo'lishi kerak`**
`SECRET_KEY` bo'sh. `generateValue` ishlamagan bo'lsa, qo'lda kiriting:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**`alembic upgrade head` ulanolmadi**
Neon'ning **Direct connection** satrini ishlatganingizni va oxirida `?sslmode=require` borligini tekshiring.

**Bot "Mini App tugmasi ko'rsatilmaydi" deb ogohlantiryapti**
`WEBAPP_URL` bo'sh yoki `https://` bilan boshlanmayapti. Telegram `http://` va `localhost` ni qabul qilmaydi.
