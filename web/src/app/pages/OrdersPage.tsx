import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Screen } from '../components/Screen'
import { OrderCard } from '../components/pieces'
import { Button } from '@/components/ui/primitives'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { Tabs, type TabItem } from '@/components/ui/data'
import type { OrderStatus } from '@/lib/types'
import styles from './HomePage.module.css'

type Filter = OrderStatus | 'all'

const TABS: TabItem<Filter>[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'confirmed', label: 'Qabul qilindi' },
  { value: 'delivered', label: 'Yetkazildi' },
  { value: 'cancelled', label: 'Bekor qilindi' },
]

const EMPTY_TEXT: Record<Filter, { title: string; description: string }> = {
  all: {
    title: 'Hali buyurtma yo‘q',
    description: 'Katalogdan mahsulot tanlab, birinchi buyurtmangizni bering.',
  },
  pending: {
    title: 'Kutilayotgan buyurtma yo‘q',
    description: 'Diller javobini kutayotgan buyurtmalar shu yerda ko‘rinadi.',
  },
  confirmed: {
    title: 'Qabul qilingan buyurtma yo‘q',
    description: 'Diller qabul qilgan buyurtmalar shu yerda ko‘rinadi.',
  },
  delivered: {
    title: 'Yetkazilgan buyurtma yo‘q',
    description: 'Yetkazib berilgan buyurtmalar tarixi shu yerda saqlanadi.',
  },
  cancelled: {
    title: 'Bekor qilingan buyurtma yo‘q',
    description: 'Bekor qilingan buyurtmalar shu yerda ko‘rinadi.',
  },
}

const PAGE_SIZE = 20

export default function OrdersPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)

  const ordersQuery = useQuery({
    queryKey: ['orders', filter, page],
    queryFn: ({ signal }) =>
      api.myOrders({ status: filter === 'all' ? '' : filter, page, size: PAGE_SIZE }, signal),
  })

  const data = ordersQuery.data

  return (
    <Screen title="Buyurtmalarim">
      <Tabs
        items={TABS}
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setPage(1)
        }}
        scrollable
      />

      {ordersQuery.isPending && <SkeletonList rows={4} height={124} />}

      {ordersQuery.isError && (
        <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
      )}

      {ordersQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="📦"
          title={EMPTY_TEXT[filter].title}
          description={EMPTY_TEXT[filter].description}
          action={
            filter === 'all' ? (
              <Button variant="primary" onClick={() => navigate('/app')}>
                Katalogga o‘tish
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Barcha buyurtmalar
              </Button>
            )
          }
        />
      )}

      {ordersQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {data.items.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          {data.pages > 1 && (
            <div className={styles.pager}>
              <Button size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                ← Oldingi
              </Button>
              <span className={styles.pagerInfo}>
                {page} / {data.pages}
              </span>
              <Button size="sm" onClick={() => setPage(page + 1)} disabled={page >= data.pages}>
                Keyingi →
              </Button>
            </div>
          )}
        </>
      )}
    </Screen>
  )
}
