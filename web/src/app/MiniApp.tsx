import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/store/auth'
import { useBackButton } from '@/lib/useTelegramUI'
import { CartProvider, useCart } from './cart'

import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'
import CategoryPage from './pages/CategoryPage'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import OrderEditPage from './pages/OrderEditPage'
import ProfilePage from './pages/ProfilePage'
import ShopEditPage from './pages/ShopEditPage'
import styles from './MiniApp.module.css'

/** Tab bar ko'rsatilmaydigan (to'liq ekran) sahifalar. */
const FULLSCREEN = [/^\/app\/product\//, /^\/app\/checkout/, /^\/app\/orders\/\d+/, /^\/app\/shop/]

function TabBar() {
  const { count } = useCart()

  const tabs = [
    { to: '/app', icon: '🏠', label: 'Bosh sahifa', end: true },
    { to: '/app/cart', icon: '🛒', label: 'Savat', badge: count },
    { to: '/app/orders', icon: '📦', label: 'Buyurtmalar' },
    { to: '/app/profile', icon: '👤', label: 'Profil' },
  ]

  return (
    <nav className={styles.tabbar} aria-label="Asosiy menyu">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
        >
          <span className={styles.tabIcon} aria-hidden="true">
            {tab.icon}
            {tab.badge ? <span className={styles.tabBadge}>{tab.badge > 99 ? '99+' : tab.badge}</span> : null}
          </span>
          <span className={styles.tabLabel}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const isRoot = location.pathname === '/app'
  const hideTabs = FULLSCREEN.some((pattern) => pattern.test(location.pathname))

  // Telegram BackButton: ildiz sahifada yashiriladi
  useBackButton(isRoot ? null : () => navigate(-1))

  // Sahifa almashganda tepaga qaytamiz
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className={`${styles.shell} ${hideTabs ? styles.shellFull : ''}`}>
      <main className={styles.content}>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="category/:categoryId" element={<CategoryPage />} />
          <Route path="product/:productId" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="orders/:orderId/edit" element={<OrderEditPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="shop" element={<ShopEditPage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
      {!hideTabs && <TabBar />}
    </div>
  )
}

export default function MiniApp() {
  const { me } = useAuth()

  // Do'kon yo'q bo'lsa — avval ro'yxatdan o'tish
  if (!me?.shop) {
    return (
      <CartProvider>
        <OnboardingPage />
      </CartProvider>
    )
  }

  return (
    <CartProvider>
      <Shell />
    </CartProvider>
  )
}
