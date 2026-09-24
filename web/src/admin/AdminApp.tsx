import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DashboardLayout, type NavItem } from '@/components/layout/DashboardLayout'

import AdminDashboard from './pages/Dashboard'
import AdminDillers from './pages/Dillers'
import AdminUsers from './pages/Users'
import AdminCategories from './pages/Categories'
import AdminProducts from './pages/Products'
import AdminOrders from './pages/Orders'
import AdminStatistics from './pages/Statistics'

export default function AdminApp() {
  const pendingQuery = useQuery({
    queryKey: ['admin', 'orders', 'pending-count'],
    queryFn: ({ signal }) => api.admin.orders({ status: 'pending', size: 1 }, signal),
    refetchInterval: 60_000,
  })

  const items: NavItem[] = [
    { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
    { to: '/admin/dillers', label: 'Dillerlar', icon: '🚚' },
    { to: '/admin/users', label: 'Mijozlar', icon: '🏪' },
    { to: '/admin/categories', label: 'Kategoriyalar', icon: '🗂️' },
    { to: '/admin/products', label: 'Mahsulotlar', icon: '📦' },
    { to: '/admin/orders', label: 'Buyurtmalar', icon: '🧾', badge: pendingQuery.data?.total },
    { to: '/admin/stats', label: 'Statistika', icon: '📈' },
  ]

  return (
    <DashboardLayout title="Boshqaruv paneli" items={items}>
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="dillers" element={<AdminDillers />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="stats" element={<AdminStatistics />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </DashboardLayout>
  )
}
