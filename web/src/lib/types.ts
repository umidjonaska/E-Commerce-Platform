/** Backend API turlari — `/openapi.json` bilan bir xil. */

export type Role = 'superadmin' | 'admin' | 'diller' | 'user'

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled'

export type CancelledBy = 'client' | 'diller' | 'superadmin'

export type StatsPeriod = 'today' | 'week' | 'month' | 'custom'

export interface OffsetPage<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface DillerPublic {
  id: number
  name: string
  company_name: string | null
  phone: string | null
  region: string | null
  work_hours: string | null
}

export interface Shop {
  id: number
  name: string
  phone: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  diller: DillerPublic | null
}

export interface MeUser {
  id: number
  username: string
  role: Role
  full_name: string | null
  phone: string | null
  telegram_id: number | null
}

export interface Me {
  user: MeUser
  shop: Shop | null
}

export interface Session {
  access_token: string
  refresh_token: string
  token_type: string
  me: Me
}

export interface Category {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  products_count: number
  created_at: string
}

export interface Product {
  id: number
  category_id: number
  category_name: string | null
  name: string
  description: string | null
  price: number
  unit: string
  min_quantity: number
  image_url: string | null
  is_active: boolean
  created_at: string
}

export interface OrderItem {
  id: number
  product_id: number | null
  product_name: string
  unit: string
  unit_price: number
  quantity: number
  line_total: number
}

export interface Order {
  id: number
  status: OrderStatus
  shop_id: number | null
  shop_name: string | null
  diller_id: number | null
  diller_name: string | null
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  latitude: number | null
  longitude: number | null
  note: string | null
  total_amount: number
  items_count: number
  reject_reason: string | null
  cancelled_by: CancelledBy | null
  items: OrderItem[]
  created_at: string
  updated_at: string
  confirmed_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  can_edit: boolean
  can_cancel: boolean
}

export interface OrderItemIn {
  product_id: number
  quantity: number
}

export interface OrderPayload {
  items: OrderItemIn[]
  note?: string | null
  delivery_address?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface Client {
  shop_id: number
  shop_name: string
  owner_name: string | null
  phone: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  orders_count: number
  total_spent: number
  last_order_at: string | null
  joined_at: string
}

export interface AdminUser {
  id: number
  username: string
  full_name: string | null
  phone: string | null
  telegram_id: number | null
  is_blocked: boolean
  created_at: string
  shop: Shop | null
  orders_count: number
  total_spent: number
}

export interface AdminDiller {
  id: number
  username: string
  full_name: string | null
  phone: string | null
  telegram_id: number | null
  company_name: string | null
  region: string | null
  work_hours: string | null
  is_blocked: boolean
  shops_count: number
  orders_count: number
  created_at: string
}

export interface StatsTotals {
  orders_count: number
  delivered_count: number
  sales_amount: number
  average_order: number
  cancelled_count: number
  pending_now: number
  confirmed_now: number
  clients_count: number
}

export interface StatsPoint {
  date: string
  orders: number
  delivered: number
  sales: number
}

export interface TopProduct {
  name: string
  quantity: number
  amount: number
}

export interface DillerStat {
  diller_id: number
  name: string
  delivered_count: number
  sales_amount: number
}

export interface Stats {
  date_from: string
  date_to: string
  totals: StatsTotals
  series: StatsPoint[]
  top_products: TopProduct[]
  top_dillers: DillerStat[] | null
}

/* ---- So'rov yuklamalari ---- */

export interface ShopRegisterPayload {
  full_name: string
  name: string
  phone: string
  address: string
  latitude?: number | null
  longitude?: number | null
  diller_id: number
}

export interface ShopUpdatePayload {
  full_name?: string | null
  name: string
  phone: string
  address: string
  latitude?: number | null
  longitude?: number | null
}

export interface CategoryPayload {
  name: string
  sort_order?: number
  is_active?: boolean
}

export interface ProductPayload {
  category_id: number
  name: string
  description?: string | null
  price: number
  unit: string
  min_quantity: number
  image_url?: string | null
  is_active: boolean
}

export interface DillerCreatePayload {
  username: string
  password: string
  full_name: string
  phone?: string | null
  telegram_id?: number | null
  company_name?: string | null
  region?: string | null
  work_hours?: string | null
}

export interface DillerUpdatePayload {
  full_name?: string
  phone?: string | null
  telegram_id?: number | null
  password?: string
  company_name?: string | null
  region?: string | null
  work_hours?: string | null
}

export interface AdminUserUpdatePayload {
  full_name?: string
  phone?: string | null
  shop_name?: string
  shop_phone?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}
