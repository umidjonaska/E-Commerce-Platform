import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, StatTile, StatusBadge } from '@/components/ui/primitives'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { DataTable, PageHeader, type Column } from '@/components/ui/data'
import { dateTime, money, number } from '@/lib/format'
import type { Order } from '@/lib/types'
import styles from '@/styles/pages.module.css'

export default function AdminDashboard() {
  const statsQuery = useQuery({
    queryKey: ['admin', 'stats', 'today'],
    queryFn: ({ signal }) => api.admin.stats({ period: 'today' }, signal),
  })

  const monthQuery = useQuery({
    queryKey: ['admin', 'stats', 'month'],
    queryFn: ({ signal }) => api.admin.stats({ period: 'month' }, signal),
  })

  const recentQuery = useQuery({
    queryKey: ['admin', 'orders', 'recent'],
    queryFn: ({ signal }) => api.admin.orders({ size: 8 }, signal),
  })

  const dillersQuery = useQuery({
    queryKey: ['admin', 'dillers', 'count'],
    queryFn: ({ signal }) => api.admin.dillers({ size: 1 }, signal),
  })

  const today = statsQuery.data?.totals
  const month = monthQuery.data?.totals
  const loading = statsQuery.isPending

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'Buyurtma',
      primary: true,
      render: (order) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>#{order.id}</span>
          <span className={styles.cellMuted}>{dateTime(order.created_at)}</span>
        </div>
      ),
    },
    { key: 'shop', header: 'Do‘kon', render: (order) => order.shop_name ?? '—' },
    { key: 'diller', header: 'Diller', render: (order) => order.diller_name ?? '—' },
    {
      key: 'total',
      header: 'Summa',
      align: 'right',
      render: (order) => <span className={styles.cellStrong}>{money(order.total_amount)}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      render: (order) => <StatusBadge status={order.status} size="sm" />,
    },
  ]

  return (
    <>
      <PageHeader title="Umumiy ko‘rinish" subtitle="Platformaning bugungi holati" />

      {statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} compact />
      ) : (
        <div className={styles.tiles}>
          <StatTile
            label="Bugungi buyurtmalar"
            value={number(today?.orders_count ?? 0)}
            loading={loading}
          />
          <StatTile
            label="Javob kutmoqda"
            value={number(today?.pending_now ?? 0)}
            tone="warning"
            hint="Butun platforma"
            loading={loading}
          />
          <StatTile
            label="Yo‘lda"
            value={number(today?.confirmed_now ?? 0)}
            tone="info"
            loading={loading}
          />
          <StatTile
            label="Bugungi savdo"
            value={money(today?.sales_amount ?? 0)}
            tone="brand"
            loading={loading}
          />
          <StatTile
            label="Shu oydagi savdo"
            value={money(month?.sales_amount ?? 0)}
            tone="success"
            loading={monthQuery.isPending}
          />
          <StatTile
            label="Mijozlar"
            value={number(today?.clients_count ?? 0)}
            hint="Ro‘yxatdan o‘tgan do‘konlar"
            loading={loading}
          />
          <StatTile
            label="Dillerlar"
            value={number(dillersQuery.data?.total ?? 0)}
            loading={dillersQuery.isPending}
          />
          <StatTile
            label="Bugun bekor qilingan"
            value={number(today?.cancelled_count ?? 0)}
            tone="danger"
            loading={loading}
          />
        </div>
      )}

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>So‘nggi buyurtmalar</h2>
        <Link to="/admin/orders" className={styles.link}>
          Barchasi →
        </Link>
      </div>

      {recentQuery.isPending && <SkeletonList rows={4} height={64} />}

      {recentQuery.isError && (
        <ErrorState error={recentQuery.error} onRetry={() => recentQuery.refetch()} compact />
      )}

      {recentQuery.isSuccess && recentQuery.data.items.length === 0 && (
        <Card>
          <EmptyState
            icon="🧾"
            title="Hali buyurtma yo‘q"
            description="Mijozlar Telegram ilovasi orqali buyurtma berganda shu yerda ko‘rinadi."
          />
        </Card>
      )}

      {recentQuery.isSuccess && recentQuery.data.items.length > 0 && (
        <DataTable
          columns={columns}
          rows={recentQuery.data.items}
          rowKey={(order) => order.id}
        />
      )}
    </>
  )
}
