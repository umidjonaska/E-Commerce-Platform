import type { CancelledBy, OrderStatus } from './types'

/** 45000 -> "45 000 so'm" */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`
}

/** 45000 -> "45 000" (valyutasiz, jadval ustunlari uchun) */
export function number(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU').replace(/ /g, ' ')
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

export function date(value: string | null | undefined): string {
  const parsed = parse(value)
  return parsed ? parsed.toLocaleDateString('ru-RU', DATE_OPTS) : '—'
}

export function dateTime(value: string | null | undefined): string {
  const parsed = parse(value)
  if (!parsed) return '—'
  return `${parsed.toLocaleDateString('ru-RU', DATE_OPTS)} ${parsed.toLocaleTimeString('ru-RU', TIME_OPTS)}`
}

/** "5 daqiqa oldin", "2 soat oldin", aks holda sana */
export function relative(value: string | null | undefined): string {
  const parsed = parse(value)
  if (!parsed) return '—'

  const diffMs = Date.now() - parsed.getTime()
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) return 'hozirgina'
  if (minutes < 60) return `${minutes} daqiqa oldin`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} soat oldin`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'kecha'
  if (days < 7) return `${days} kun oldin`

  return date(value)
}

/** YYYY-MM-DD (backend sana formatida) */
export function isoDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Kutilmoqda',
  confirmed: 'Qabul qilindi',
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
}

export const CANCELLED_BY_LABELS: Record<CancelledBy, string> = {
  client: 'Mijoz bekor qildi',
  diller: 'Diller rad etdi',
  superadmin: 'Administrator bekor qildi',
}

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? status
}

/** Telefon raqamiga qo'ng'iroq havolasi */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const clean = phone.replace(/[^\d+]/g, '')
  return clean ? `tel:${clean}` : null
}

/** Lokatsiya uchun xarita havolasi */
export function mapHref(lat: number | null, lng: number | null): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null
  return `https://maps.google.com/?q=${lat},${lng}`
}

/** "Aziz Karimov" -> "AK" */
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}

/** 1 -> "1 dona" */
export function quantity(value: number, unit: string): string {
  return `${number(value)} ${unit}`
}
