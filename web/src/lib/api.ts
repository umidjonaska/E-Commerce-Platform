/**
 * API qatlami.
 *
 * Mas'uliyati: token saqlash, avtomatik yangilash (refresh), so'rovni bekor qilish
 * va backend xatolarini foydalanuvchi tushunadigan ko'rinishga keltirish.
 * Biznes qoidalari bu yerda EMAS — ular backendda qoladi.
 */

import type {
  AdminDiller,
  AdminUser,
  AdminUserUpdatePayload,
  Category,
  CategoryPayload,
  Client,
  DillerCreatePayload,
  DillerPublic,
  DillerUpdatePayload,
  Me,
  OffsetPage,
  Order,
  OrderPayload,
  OrderStatus,
  Product,
  ProductPayload,
  Session,
  ShopRegisterPayload,
  ShopUpdatePayload,
  Stats,
  StatsPeriod,
} from './types'

const BASE = '/api/v1'

const ACCESS_KEY = 'dp_access_token'
const REFRESH_KEY = 'dp_refresh_token'

/* ------------------------------------------------------------------ */
/* Token saqlash                                                       */
/* ------------------------------------------------------------------ */

/** localStorage xususiy rejimda yoki bloklanganda xato tashlashi mumkin. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* saqlab bo'lmasa ham ilova ishlashda davom etadi */
  }
}

let accessToken: string | null = safeGet(ACCESS_KEY)
let refreshToken: string | null = safeGet(REFRESH_KEY)

export function getAccessToken() {
  return accessToken
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
  safeSet(ACCESS_KEY, access)
  safeSet(REFRESH_KEY, refresh)
}

export function clearTokens() {
  setTokens(null, null)
}

/** Sessiya butunlay tugaganda (refresh ham ishlamadi) chaqiriladi. */
type LogoutHandler = () => void
let onAuthLost: LogoutHandler = () => {}

export function setAuthLostHandler(handler: LogoutHandler) {
  onAuthLost = handler
}

/* ------------------------------------------------------------------ */
/* Xatolar                                                             */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number
  /** Maydon nomi -> xato matni (backend 422 validatsiyasidan) */
  fieldErrors: Record<string, string>
  /** Tarmoq uzilgan bo'lsa true (server javob bermadi) */
  isNetwork: boolean

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    isNetwork = false,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.isNetwork = isNetwork
  }
}

const FIELD_LABELS: Record<string, string> = {
  username: 'Login',
  password: 'Parol',
  full_name: 'Ism',
  name: 'Nom',
  phone: 'Telefon',
  address: 'Manzil',
  price: 'Narx',
  unit: 'Birlik',
  min_quantity: 'Minimal miqdor',
  category_id: 'Kategoriya',
  diller_id: 'Diller',
  items: 'Mahsulotlar',
  quantity: 'Miqdor',
  note: 'Izoh',
  image_url: 'Rasm',
  telegram_id: 'Telegram ID',
  company_name: 'Kompaniya',
  region: 'Hudud',
  work_hours: 'Ish vaqti',
  sort_order: 'Tartib',
  shop_name: "Do'kon nomi",
  shop_phone: "Do'kon telefoni",
  reason: 'Sabab',
}

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/** FastAPI 422 javobini maydonlar bo'yicha xabarlarga aylantiradi. */
function parseValidation(detail: unknown): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  const messages: string[] = []

  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (!item || typeof item !== 'object') continue
      const loc = Array.isArray((item as { loc?: unknown[] }).loc) ? (item as { loc: unknown[] }).loc : []
      const msg = String((item as { msg?: unknown }).msg ?? "Qiymat noto'g'ri")
      // loc: ["body", "field", ...] — birinchi element joylashuv turi
      const path = loc.slice(1).filter((p) => typeof p === 'string') as string[]
      const field = path[path.length - 1] ?? path[0]
      const clean = msg.replace(/^Value error,\s*/i, '')
      if (field) {
        fields[field] = clean
        messages.push(`${labelFor(field)}: ${clean}`)
      } else {
        messages.push(clean)
      }
    }
  }

  return {
    message: messages.length ? messages.join('. ') : "Kiritilgan ma'lumotda xatolik bor",
    fields,
  }
}

const STATUS_FALLBACK: Record<number, string> = {
  400: "So'rov noto'g'ri",
  401: 'Sessiya tugadi, qaytadan kiring',
  403: "Bu amal uchun ruxsatingiz yo'q",
  404: 'Ma’lumot topilmadi',
  409: "Amalni bajarib bo'lmadi",
  413: 'Fayl hajmi juda katta',
  422: "Kiritilgan ma'lumotda xatolik bor",
  429: "Juda ko'p so'rov yuborildi, biroz kuting",
  500: 'Serverda kutilmagan xatolik yuz berdi',
  502: 'Server javob bermayapti',
  503: 'Xizmat vaqtincha mavjud emas',
  504: 'Server javob bermadi',
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    /* JSON bo'lmasa ham status bo'yicha xabar beramiz */
  }

  const detail = (body as { detail?: unknown } | null)?.detail

  if (response.status === 422) {
    const { message, fields } = parseValidation(detail)
    return new ApiError(message, 422, fields)
  }

  if (typeof detail === 'string' && detail.trim()) {
    return new ApiError(detail, response.status)
  }

  return new ApiError(
    STATUS_FALLBACK[response.status] ?? `Xatolik yuz berdi (${response.status})`,
    response.status,
  )
}

/* ------------------------------------------------------------------ */
/* Refresh — bir vaqtda faqat bitta so'rov ketadi (single flight)      */
/* ------------------------------------------------------------------ */

let refreshPromise: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!response.ok) return false
        const session = (await response.json()) as Session
        setTokens(session.access_token, session.refresh_token)
        return true
      } catch {
        return false
      } finally {
        // Keyingi 401 yangi urinish boshlashi uchun tozalanadi
        setTimeout(() => {
          refreshPromise = null
        }, 0)
      }
    })()
  }

  return refreshPromise
}

/* ------------------------------------------------------------------ */
/* Asosiy so'rov funksiyasi                                            */
/* ------------------------------------------------------------------ */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Token qo'shilmaydi (login/refresh uchun) */
  anonymous?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, anonymous = false } = options

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
    if (!anonymous && accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    return fetch(`${BASE}${path}`, {
      method,
      headers,
      signal,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    })
  }

  let response: Response
  try {
    response = await send()
  } catch (error) {
    // Bekor qilingan so'rov xato emas — chaqiruvchiga o'zini uzatamiz
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      'Internetga ulanib bo’lmadi. Aloqani tekshirib, qayta urinib ko’ring.',
      0,
      {},
      true,
    )
  }

  // Access token eskirgan bo'lsa bir marta yangilab, so'rovni qaytaramiz
  if (response.status === 401 && !anonymous && refreshToken) {
    const refreshed = await refreshSession()
    if (refreshed) {
      try {
        response = await send()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ApiError('Internetga ulanib bo’lmadi.', 0, {}, true)
      }
    } else {
      clearTokens()
      onAuthLost()
      throw new ApiError('Sessiya tugadi, qaytadan kiring', 401)
    }
  }

  if (response.status === 401 && !anonymous) {
    clearTokens()
    onAuthLost()
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Query parametrlarini quradi; bo'sh/undefined qiymatlar tashlab yuboriladi. */
function qs(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

/* ------------------------------------------------------------------ */
/* Endpointlar                                                         */
/* ------------------------------------------------------------------ */

export interface PageParams {
  page?: number
  size?: number
}

export interface OrderFilters extends PageParams {
  status?: OrderStatus | ''
  q?: string
  shop_id?: number
  diller_id?: number
  date_from?: string
  date_to?: string
}

export interface StatsParams {
  period: StatsPeriod
  date_from?: string
  date_to?: string
  diller_id?: number
}

export const api = {
  /* ---- Auth ---- */
  loginWithTelegram: (initData: string) =>
    request<Session>('/auth/telegram', {
      method: 'POST',
      body: { init_data: initData },
      anonymous: true,
    }),

  login: (username: string, password: string) =>
    request<Session>('/auth/login', {
      method: 'POST',
      body: { username, password },
      anonymous: true,
    }),

  /* ---- Umumiy ---- */
  me: (signal?: AbortSignal) => request<Me>('/me', { signal }),

  publicDillers: (signal?: AbortSignal) => request<DillerPublic[]>('/dillers', { signal }),

  registerShop: (payload: ShopRegisterPayload) =>
    request<Me>('/me/shop', { method: 'POST', body: payload }),

  updateShop: (payload: ShopUpdatePayload) =>
    request<Me>('/me/shop', { method: 'PUT', body: payload }),

  /* ---- Katalog (mijoz) ---- */
  categories: (signal?: AbortSignal) => request<Category[]>('/categories', { signal }),

  products: (
    params: { category_id?: number; q?: string; ids?: string } & PageParams,
    signal?: AbortSignal,
  ) => request<OffsetPage<Product>>(`/products${qs(params)}`, { signal }),

  product: (id: number, signal?: AbortSignal) => request<Product>(`/products/${id}`, { signal }),

  /* ---- Buyurtmalar (mijoz) ---- */
  createOrder: (payload: OrderPayload) =>
    request<Order>('/orders', { method: 'POST', body: payload }),

  myOrders: (params: { status?: OrderStatus | '' } & PageParams, signal?: AbortSignal) =>
    request<OffsetPage<Order>>(`/orders${qs(params)}`, { signal }),

  myOrder: (id: number, signal?: AbortSignal) => request<Order>(`/orders/${id}`, { signal }),

  updateOrder: (id: number, payload: OrderPayload) =>
    request<Order>(`/orders/${id}`, { method: 'PUT', body: payload }),

  cancelOrder: (id: number) => request<Order>(`/orders/${id}/cancel`, { method: 'POST' }),

  /* ---- Diller ---- */
  diller: {
    stats: (params: StatsParams, signal?: AbortSignal) =>
      request<Stats>(`/diller/stats${qs({ ...params })}`, { signal }),

    clients: (params: { q?: string } & PageParams, signal?: AbortSignal) =>
      request<OffsetPage<Client>>(`/diller/clients${qs(params)}`, { signal }),

    client: (shopId: number, signal?: AbortSignal) =>
      request<Client>(`/diller/clients/${shopId}`, { signal }),

    orders: (params: OrderFilters, signal?: AbortSignal) =>
      request<OffsetPage<Order>>(`/diller/orders${qs({ ...params })}`, { signal }),

    order: (id: number, signal?: AbortSignal) => request<Order>(`/diller/orders/${id}`, { signal }),

    accept: (id: number) => request<Order>(`/diller/orders/${id}/accept`, { method: 'POST' }),

    deliver: (id: number) => request<Order>(`/diller/orders/${id}/deliver`, { method: 'POST' }),

    reject: (id: number, reason?: string) =>
      request<Order>(`/diller/orders/${id}/reject`, {
        method: 'POST',
        body: { reason: reason?.trim() || null },
      }),
  },

  /* ---- Superadmin ---- */
  admin: {
    stats: (params: StatsParams, signal?: AbortSignal) =>
      request<Stats>(`/admin/stats${qs({ ...params })}`, { signal }),

    dillers: (params: { q?: string; blocked?: boolean } & PageParams, signal?: AbortSignal) =>
      request<OffsetPage<AdminDiller>>(`/admin/dillers${qs({ ...params })}`, { signal }),

    diller: (id: number, signal?: AbortSignal) =>
      request<AdminDiller>(`/admin/dillers/${id}`, { signal }),

    createDiller: (payload: DillerCreatePayload) =>
      request<AdminDiller>('/admin/dillers', { method: 'POST', body: payload }),

    updateDiller: (id: number, payload: DillerUpdatePayload) =>
      request<AdminDiller>(`/admin/dillers/${id}`, { method: 'PUT', body: payload }),

    blockDiller: (id: number) =>
      request<AdminDiller>(`/admin/dillers/${id}/block`, { method: 'POST' }),

    unblockDiller: (id: number) =>
      request<AdminDiller>(`/admin/dillers/${id}/unblock`, { method: 'POST' }),

    users: (
      params: { q?: string; diller_id?: number; blocked?: boolean } & PageParams,
      signal?: AbortSignal,
    ) => request<OffsetPage<AdminUser>>(`/admin/users${qs({ ...params })}`, { signal }),

    user: (id: number, signal?: AbortSignal) => request<AdminUser>(`/admin/users/${id}`, { signal }),

    updateUser: (id: number, payload: AdminUserUpdatePayload) =>
      request<AdminUser>(`/admin/users/${id}`, { method: 'PUT', body: payload }),

    reassignUser: (id: number, dillerId: number) =>
      request<AdminUser>(`/admin/users/${id}/reassign`, {
        method: 'POST',
        body: { diller_id: dillerId },
      }),

    blockUser: (id: number) => request<AdminUser>(`/admin/users/${id}/block`, { method: 'POST' }),

    unblockUser: (id: number) =>
      request<AdminUser>(`/admin/users/${id}/unblock`, { method: 'POST' }),

    categories: (signal?: AbortSignal) => request<Category[]>('/admin/categories', { signal }),

    createCategory: (payload: CategoryPayload) =>
      request<Category>('/admin/categories', { method: 'POST', body: payload }),

    updateCategory: (id: number, payload: Partial<CategoryPayload>) =>
      request<Category>(`/admin/categories/${id}`, { method: 'PUT', body: payload }),

    deleteCategory: (id: number) =>
      request<void>(`/admin/categories/${id}`, { method: 'DELETE' }),

    products: (
      params: { category_id?: number; q?: string; is_active?: boolean } & PageParams,
      signal?: AbortSignal,
    ) => request<OffsetPage<Product>>(`/admin/products${qs({ ...params })}`, { signal }),

    createProduct: (payload: ProductPayload) =>
      request<Product>('/admin/products', { method: 'POST', body: payload }),

    updateProduct: (id: number, payload: Partial<ProductPayload>) =>
      request<Product>(`/admin/products/${id}`, { method: 'PUT', body: payload }),

    deleteProduct: (id: number) => request<void>(`/admin/products/${id}`, { method: 'DELETE' }),

    uploadImage: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<{ url: string }>('/admin/uploads/image', { method: 'POST', body: form })
    },

    orders: (params: OrderFilters, signal?: AbortSignal) =>
      request<OffsetPage<Order>>(`/admin/orders${qs({ ...params })}`, { signal }),

    order: (id: number, signal?: AbortSignal) => request<Order>(`/admin/orders/${id}`, { signal }),

    changeOrderStatus: (id: number, status: OrderStatus, reason?: string) =>
      request<Order>(`/admin/orders/${id}/status`, {
        method: 'POST',
        body: { status, reason: reason?.trim() || null },
      }),
  },
}
