import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, StatTile, StatusBadge } from '@/components/ui/primitives'
import { EmptyState, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { DataTable, PageHeader, type Column } from '@/components/ui/data'
import { OrderView } from '@/components/shared/OrderView'
import { money, number, relative } from '@/lib/format'
import { useMe } from '@/store/auth'
import type { Order } from '@/lib/types'
import { useOrderActions } from '../useOrderActions'
import { useState } from 'react'
import styles from '@/styles/pages.module.css'

export default function DillerDashboard() {
  const me = useMe()
  const [selected, setSelected] = useState<Order | null>(null)

  const statsQuery = useQuery({
    queryKey: ['diller', 'stats', 'today'],
    queryFn: ({ signal }) => api.diller.stats({ period: 'today' }, signal),
  })

  const pendingQuery = useQuery({
    queryKey: ['diller', 'orders', 'pending', 'dashboard'],
    queryFn: ({ signal }) => api.diller.orders({ status: 'pending', size: 10 }, signal),
  })

  const actions = useOrderActions(() => setSelected(null))

  const totals = statsQuery.data?.totals
  const loading = statsQuery.isPending

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'Buyurtma',
      primary: true,
      render: (order) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>#{order.id}</span>
          <span className={styles.cellMuted}>{relative(order.created_at)}</span>
        </div>
      ),
    },
    {
      key: 'shop',
      header: 'Do‘kon',
      render: (order) => (
        <div className={styles.cellStack}>
          <span>{order.shop_name ?? '—'}</span>
          <span className={styles.cellMuted}>{order.customer_phone ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Mahsulot',
      align: 'right',
      render: (order) => `${number(order.items_count)} xil`,
    },
    {
      key: 'total',
      header: 'Summa',
      align: 'right',
      render: (order) => <span className={styles.cellStrong}>{money(order.total_amount)}</span>,
    },
    {
      key: 'actions',
      header: 'Amallar',
      render: (order) => (
        <div
          className={styles.actionsCell}
          onClick={(event) => event.stopPropagation()}
          role="presentation"
        >
          {actions.buttons(order, 'sm')}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={`Salom, ${me.user.full_name || me.user.username}!`}
        subtitle="Bugungi ko‘rsatkichlar"
      />

      {statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} compact />
      ) : (
        <div className={styles.tiles}>
          <StatTile
            label="Bugungi buyurtmalar"
            value={number(totals?.orders_count ?? 0)}
            loading={loading}
          />
          <StatTile
            label="Javob kutmoqda"
            value={number(totals?.pending_now ?? 0)}
            tone="warning"
            hint="Hozir"
            loading={loading}
          />
          <StatTile
            label="Qabul qilingan"
            value={number(totals?.confirmed_now ?? 0)}
            tone="info"
            hint="Yetkazish kerak"
            loading={loading}
          />
          <StatTile
            label="Bugun yetkazildi"
            value={number(totals?.delivered_count ?? 0)}
            tone="success"
            loading={loading}
          />
          <StatTile
            label="Bugungi savdo"
            value={money(totals?.sales_amount ?? 0)}
            tone="brand"
            loading={loading}
          />
          <StatTile label="Mijozlar" value={number(totals?.clients_count ?? 0)} loading={loading} />
        </div>
      )}

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Javob kutayotgan buyurtmalar</h2>
        <Link to="/diller/orders" className={styles.link}>
          Barchasi →
        </Link>
      </div>

      {pendingQuery.isPending && <SkeletonList rows={3} height={68} />}

      {pendingQuery.isError && (
        <ErrorState error={pendingQuery.error} onRetry={() => pendingQuery.refetch()} compact />
      )}

      {pendingQuery.isSuccess && pendingQuery.data.items.length === 0 && (
        <Card>
          <EmptyState
            icon="✅"
            title="Hammasi ko‘rib chiqilgan"
            description="Javob kutayotgan buyurtma yo‘q. Yangi buyurtma kelganda shu yerda ko‘rinadi."
          />
        </Card>
      )}

      {pendingQuery.isSuccess && pendingQuery.data.items.length > 0 && (
        <DataTable
          columns={columns}
          rows={pendingQuery.data.items}
          rowKey={(order) => order.id}
          onRowClick={(order) => setSelected(order)}
        />
      )}

      <Modal
        open={selected !== null}
        title={selected ? `Buyurtma #${selected.id}` : ''}
        onClose={() => setSelected(null)}
        size="lg"
      >
        {selected && (
          <OrderView
            order={selected}
            actions={
              <>
                {actions.buttons(selected)}
                <StatusBadge status={selected.status} />
              </>
            }
          />
        )}
      </Modal>

      {actions.dialogs}
    </>
  )
}
