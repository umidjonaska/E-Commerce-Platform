import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, api, clearTokens, getAccessToken, setAuthLostHandler, setTokens } from '@/lib/api'
import { getInitData, isTelegram } from '@/lib/telegram'
import type { Me, Role } from '@/lib/types'

type Status = 'loading' | 'authenticated' | 'anonymous' | 'error'

interface AuthState {
  status: Status
  me: Me | null
  /** Sessiyani tiklashda yuz bergan xato (qayta urinish uchun ko'rsatiladi) */
  error: string | null
  role: Role | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  retry: () => void
  /** `/me` javobini yangilaydi (ro'yxatdan o'tgandan yoki do'kon tahrirlangandan keyin) */
  setMe: (me: Me) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMeState] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const logout = useCallback(() => {
    clearTokens()
    setMeState(null)
    setError(null)
    setStatus('anonymous')
  }, [])

  // API qatlamidan "sessiya butunlay tugadi" signalini qabul qilamiz
  useEffect(() => {
    setAuthLostHandler(() => {
      setMeState(null)
      setStatus('anonymous')
    })
  }, [])

  useEffect(() => {
    // StrictMode effektni ikki marta chaqiradi (mount -> cleanup -> mount).
    // Har bir chaqiruv o'z `cancelled` bayrog'iga ega: bekor qilingani natijani
    // e'tiborsiz qoldiradi, oxirgi tirik chaqiruv esa holatni o'rnatadi.
    let cancelled = false

    const boot = async () => {
      setStatus('loading')
      setError(null)

      // 1) Saqlangan token bo'lsa, shuni sinab ko'ramiz
      if (getAccessToken()) {
        try {
          const current = await api.me()
          if (cancelled) return
          setMeState(current)
          setStatus('authenticated')
          return
        } catch (err) {
          // 401/403 bo'lsa quyida Telegram orqali urinib ko'ramiz
          if (err instanceof ApiError && err.isNetwork) {
            if (cancelled) return
            setError(err.message)
            setStatus('error')
            return
          }
          clearTokens()
        }
      }

      // 2) Telegram ichida bo'lsak — avtomatik kiramiz
      if (isTelegram) {
        try {
          const session = await api.loginWithTelegram(getInitData())
          if (cancelled) return
          setTokens(session.access_token, session.refresh_token)
          setMeState(session.me)
          setStatus('authenticated')
          return
        } catch (err) {
          if (cancelled) return
          setError(
            err instanceof ApiError
              ? err.message
              : 'Telegram orqali kirishda xatolik yuz berdi',
          )
          setStatus('error')
          return
        }
      }

      // 3) Aks holda login sahifasi
      if (!cancelled) setStatus('anonymous')
    }

    void boot()

    return () => {
      cancelled = true
    }
  }, [attempt])

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password)
    setTokens(session.access_token, session.refresh_token)
    setMeState(session.me)
    setError(null)
    setStatus('authenticated')
  }, [])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  const setMe = useCallback((next: Me) => setMeState(next), [])

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      error,
      role: me?.user.role ?? null,
      login,
      logout,
      retry,
      setMe,
    }),
    [status, me, error, login, logout, retry, setMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth faqat AuthProvider ichida ishlaydi')
  return context
}

/** Autentifikatsiyadan o'tgan foydalanuvchi kafolatlangan joylarda ishlatiladi. */
export function useMe(): Me {
  const { me } = useAuth()
  if (!me) throw new Error('useMe faqat tizimga kirgan holatda ishlaydi')
  return me
}
