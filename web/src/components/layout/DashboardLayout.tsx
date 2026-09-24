import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Avatar, Button } from '@/components/ui/primitives'
import { useAuth } from '@/store/auth'
import styles from './DashboardLayout.module.css'

export interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  /** Yon menyuda ko'rsatiladigan hisoblagich (masalan, kutilayotgan buyurtmalar) */
  badge?: number
}

export function DashboardLayout({
  title,
  items,
  children,
}: {
  title: string
  items: NavItem[]
  children: ReactNode
}) {
  const { me, logout } = useAuth()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)

  // Sahifa almashganda mobil menyu yopiladi
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

  // Menyu ochiq bo'lsa fon aylanmasin
  useEffect(() => {
    if (!drawer) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawer])

  const nav = (
    <nav className={styles.nav} aria-label="Asosiy menyu">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
        >
          <span className={styles.navIcon} aria-hidden="true">
            {item.icon}
          </span>
          <span className={styles.navLabel}>{item.label}</span>
          {item.badge ? <span className={styles.navBadge}>{item.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className={styles.layout}>
      {/* ---------- Yon panel (desktop) ---------- */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            ◆
          </span>
          <span className={styles.brandText}>{title}</span>
        </div>
        {nav}
        <div className={styles.sidebarFooter}>
          <div className={styles.user}>
            <Avatar name={me?.user.full_name || me?.user.username} size={34} />
            <div className={styles.userText}>
              <span className={styles.userName}>
                {me?.user.full_name || me?.user.username}
              </span>
              <span className={styles.userRole}>
                {me?.user.role === 'superadmin' ? 'Administrator' : 'Diller'}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" block onClick={logout}>
            Chiqish
          </Button>
        </div>
      </aside>

      {/* ---------- Mobil sarlavha ---------- */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.burger}
          onClick={() => setDrawer(true)}
          aria-label="Menyuni ochish"
        >
          ☰
        </button>
        <span className={styles.topbarTitle}>{title}</span>
        <Avatar name={me?.user.full_name || me?.user.username} size={30} />
      </header>

      {/* ---------- Mobil menyu ---------- */}
      {drawer && (
        <div className={styles.drawerOverlay} onClick={() => setDrawer(false)}>
          <aside
            className={styles.drawer}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Menyu"
          >
            <div className={styles.drawerHead}>
              <span className={styles.brandText}>{title}</span>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setDrawer(false)}
                aria-label="Yopish"
              >
                ✕
              </button>
            </div>
            {nav}
            <div className={styles.sidebarFooter}>
              <div className={styles.user}>
                <Avatar name={me?.user.full_name || me?.user.username} size={34} />
                <div className={styles.userText}>
                  <span className={styles.userName}>
                    {me?.user.full_name || me?.user.username}
                  </span>
                  <span className={styles.userRole}>
                    {me?.user.role === 'superadmin' ? 'Administrator' : 'Diller'}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" block onClick={logout}>
                Chiqish
              </Button>
            </div>
          </aside>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  )
}
