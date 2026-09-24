import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'
import { ErrorState, LoadingBlock } from '@/components/ui/feedback'
import { useAuth } from '@/store/auth'
import { isTelegram } from '@/lib/telegram'
import type { Role } from '@/lib/types'

import LoginPage from '@/pages/LoginPage'
import styles from './App.module.css'

// Har bir zona alohida bo'lakka ajratiladi: Telegram Mini App mobil internetda
// diller/admin paneli va grafik kutubxonasini yuklab o'tirmaydi.
const MiniApp = lazy(() => import('@/app/MiniApp'))
const DillerApp = lazy(() => import('@/diller/DillerApp'))
const AdminApp = lazy(() => import('@/admin/AdminApp'))

function ZoneFallback() {
  return (
    <div className={styles.fullscreen}>
      <LoadingBlock label="Yuklanmoqda…" />
    </div>
  )
}

/** Rolga mos boshlang'ich sahifa. */
function homeFor(role: Role | null): string {
  switch (role) {
    case 'superadmin':
      return '/admin'
    case 'diller':
    case 'admin':
      return '/diller'
    case 'user':
      return '/app'
    default:
      return '/login'
  }
}

function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { status, role } = useAuth()
  const location = useLocation()

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!role || !allow.includes(role)) {
    return (
      <div className={styles.fullscreen}>
        <ErrorState
          error={new Error('Bu bo‘limga kirish huquqingiz yo‘q.')}
          onRetry={undefined}
        />
        <Button variant="primary" onClick={() => window.location.assign(homeFor(role))}>
          Bosh sahifaga qaytish
        </Button>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  const { status, role, error, retry, logout } = useAuth()

  if (status === 'loading') {
    return (
      <div className={styles.fullscreen}>
        <LoadingBlock label="Ilova yuklanmoqda…" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={styles.fullscreen}>
        <ErrorState error={new Error(error ?? 'Xatolik')} onRetry={retry} />
        {!isTelegram && (
          <Button variant="ghost" onClick={logout}>
            Login sahifasiga o‘tish
          </Button>
        )}
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          status === 'authenticated' ? <Navigate to={homeFor(role)} replace /> : <LoginPage />
        }
      />

      <Route
        path="/app/*"
        element={
          <RequireRole allow={['user']}>
            <Suspense fallback={<ZoneFallback />}>
              <MiniApp />
            </Suspense>
          </RequireRole>
        }
      />

      <Route
        path="/diller/*"
        element={
          <RequireRole allow={['diller', 'admin']}>
            <Suspense fallback={<ZoneFallback />}>
              <DillerApp />
            </Suspense>
          </RequireRole>
        }
      />

      <Route
        path="/admin/*"
        element={
          <RequireRole allow={['superadmin']}>
            <Suspense fallback={<ZoneFallback />}>
              <AdminApp />
            </Suspense>
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to={homeFor(role)} replace />} />
    </Routes>
  )
}
