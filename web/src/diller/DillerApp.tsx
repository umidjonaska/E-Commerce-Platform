import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DashboardLayout, type NavItem } from '@/components/layout/DashboardLayout'

import DillerDashboard from './pages/Dashboard'
import DillerOrders from './pages/Orders'
import DillerClients from './pages/Clients'
import DillerClientDetail from './pages/ClientDetail'
import DillerStatistics from './pages/Statistics'

export default function DillerApp() {
  // Yon menyudagi "kutilmoqda" hisoblagichi
  const pendingQuery = useQuery({
    queryKey: ['diller', 'orders', 'pending-count'],
    queryFn: ({ signal }) => api.diller.orders({ status: 'pending', size: 1 }, signal),
    refetchInterval: 60_000,
  })

  const items: NavItem[] = [
    { to: '/diller', label: 'Dashboard', icon: '📊', end: true },
    { to: '/diller/orders', label: 'Buyurtmalar', icon: '📦', badge: pendingQuery.data?.total },
    { to: '/diller/clients', label: 'Mijozlar', icon: '🏪' },
    { to: '/diller/stats', label: 'Statistika', icon: '📈' },
  ]

  return (
    <DashboardLayout title="Diller kabineti" items={items}>
      <Routes>
        <Route index element={<DillerDashboard />} />
        <Route path="orders" element={<DillerOrders />} />
        <Route path="clients" element={<DillerClients />} />
        <Route path="clients/:shopId" element={<DillerClientDetail />} />
        <Route path="stats" element={<DillerStatistics />} />
        <Route path="*" element={<Navigate to="/diller" replace />} />
      </Routes>
    </DashboardLayout>
  )
}
