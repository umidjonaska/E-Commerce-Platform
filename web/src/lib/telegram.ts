/**
 * Telegram WebApp API ustidan yupqa qatlam.
 *
 * Ilova Telegram ichida ham, oddiy brauzerda ham ishlashi kerak. Shu sababli
 * har bir chaqiruv `WebApp` mavjudligini tekshiradi va bo'lmasa jim o'tib ketadi.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type NotificationType = 'error' | 'success' | 'warning'

interface ThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  section_bg_color?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name?: string; last_name?: string; username?: string } }
  version: string
  colorScheme: 'light' | 'dark'
  themeParams: ThemeParams
  viewportStableHeight: number
  isExpanded: boolean
  ready(): void
  expand(): void
  close(): void
  enableClosingConfirmation(): void
  disableClosingConfirmation(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  onEvent(event: string, handler: () => void): void
  offEvent(event: string, handler: () => void): void
  MainButton: {
    text: string
    isVisible: boolean
    isActive: boolean
    setText(text: string): void
    show(): void
    hide(): void
    enable(): void
    disable(): void
    showProgress(leaveActive?: boolean): void
    hideProgress(): void
    onClick(handler: () => void): void
    offClick(handler: () => void): void
    setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void
  }
  BackButton: {
    isVisible: boolean
    show(): void
    hide(): void
    onClick(handler: () => void): void
    offClick(handler: () => void): void
  }
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void
    notificationOccurred(type: NotificationType): void
    selectionChanged(): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export const webApp: TelegramWebApp | null =
  typeof window !== 'undefined' ? (window.Telegram?.WebApp ?? null) : null

/** initData bo'sh bo'lsa, sahifa Telegram tashqarisida ochilgan. */
export const isTelegram = Boolean(webApp && webApp.initData)

export function getInitData(): string {
  return webApp?.initData ?? ''
}

export function telegramUser() {
  return webApp?.initDataUnsafe?.user ?? null
}

/* ------------------------------------------------------------------ */
/* Mavzu                                                               */
/* ------------------------------------------------------------------ */

/** Telegram mavzusini CSS o'zgaruvchilariga ko'chiradi. */
function applyTheme() {
  if (!webApp) return

  const root = document.documentElement
  root.dataset.theme = webApp.colorScheme === 'dark' ? 'dark' : 'light'

  const params = webApp.themeParams ?? {}
  const map: Array<[keyof ThemeParams, string]> = [
    ['bg_color', '--c-bg'],
    ['secondary_bg_color', '--c-surface'],
    ['text_color', '--c-text'],
    ['hint_color', '--c-text-muted'],
    ['button_color', '--c-brand'],
  ]

  for (const [key, cssVar] of map) {
    const value = params[key]
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) {
      root.style.setProperty(cssVar, value)
    }
  }

  // Sarlavha va fon Telegram oynasi bilan bir xil ko'rinishi uchun
  const surface = params.secondary_bg_color ?? params.bg_color
  if (surface && webApp.setHeaderColor) {
    try {
      webApp.setHeaderColor(surface)
    } catch {
      /* eski Telegram versiyalarida bo'lmasligi mumkin */
    }
  }
}

/** Ilova yuklanganda bir marta chaqiriladi. */
export function initTelegram() {
  if (!webApp) {
    // Brauzerda tizim mavzusiga ergashamiz
    if (typeof window !== 'undefined' && window.matchMedia) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)')
      const sync = () => {
        document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light'
      }
      sync()
      dark.addEventListener('change', sync)
    }
    return
  }

  webApp.ready()
  webApp.expand()
  applyTheme()
  webApp.onEvent('themeChanged', applyTheme)

  const syncViewport = () => {
    document.documentElement.style.setProperty(
      '--tg-viewport-height',
      `${webApp.viewportStableHeight}px`,
    )
  }
  syncViewport()
  webApp.onEvent('viewportChanged', syncViewport)
}

/* ------------------------------------------------------------------ */
/* Haptic                                                             */
/* ------------------------------------------------------------------ */

export const haptic = {
  tap(style: HapticStyle = 'light') {
    webApp?.HapticFeedback?.impactOccurred(style)
  },
  success() {
    webApp?.HapticFeedback?.notificationOccurred('success')
  },
  error() {
    webApp?.HapticFeedback?.notificationOccurred('error')
  },
  warning() {
    webApp?.HapticFeedback?.notificationOccurred('warning')
  },
  select() {
    webApp?.HapticFeedback?.selectionChanged()
  },
}

/* ------------------------------------------------------------------ */
/* Yopish tasdig'i                                                     */
/* ------------------------------------------------------------------ */

/** Savatda mahsulot bo'lsa, tasodifan yopib yuborishning oldini oladi. */
export function setClosingConfirmation(enabled: boolean) {
  if (!webApp) return
  try {
    if (enabled) webApp.enableClosingConfirmation()
    else webApp.disableClosingConfirmation()
  } catch {
    /* qo'llab-quvvatlanmasa e'tiborsiz */
  }
}

export function closeApp() {
  webApp?.close()
}
