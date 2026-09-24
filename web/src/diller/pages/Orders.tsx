import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, StatusBadge } from '@/components/ui/primitives'
import { EmptyState, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { DataTable, PageHeader, Pagination, SearchInput, Tabs, Toolbar, type Column, type TabItem } from '@/components/ui/data'
import { OrderView } from '@/components/shared/OrderView'
import { dateTime, money, number, relative } from '@/lib/format'
import type { Order, OrderStatus } from '@/lib/types'
import { useOrderActions } from '../useOrderActions'
import styles from '@/styles/pages.module.css'

type Filter = OrderStatus | 'all'

const TABS: TabItem<Filter>[] = [
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'confirmed', label: 'Qabul qilingan' },
  { value: 'delivered', label: 'Yetkazilgan' },
  { value: 'cancelled', label: 'Bekor qilingan' },
  { value: 'all', label: 'Hammasi' },
]

const EMPTY: Record<Filter, string> = {
  pending: 'Javob kutayotgan buyurtma yo‘q',
  confirmed: 'Qabul qilingan buyurtma yo‘q',
  delivered: 'Yetkazilgan buyurtma yo‘q',
  cancelled: 'Bekor qilingan buyurtma yo‘q',
  all: 'Hali buyurtma yo‘q',
}

const PAGE_SIZE = 20

export default function DillerOrders() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)

  const ordersQuery = useQuery({
    queryKey: ['diller', 'orders', filter, search, page],
    queryFn: ({ signal }) =>
      api.diller.orders(
        { status: filter === 'all' ? '' : filter, q: search || undefined, page, size: PAGE_SIZE },
        signal,
      ),
  })

  const actions = useOrderActions(() => setSelected(null))

  const data = ordersQuery.data

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
          <span className={styles.cellMuted}>{order.customer_name ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      render: (order) => order.customer_phone ?? '—',
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
      key: 'status',
      header: 'Holat',
      render: (order) => <StatusBadge status={order.status} size="sm" />,
    },
    {
      key: 'created',
      header: 'Vaqt',
      hideOnMobile: true,
      render: (order) => <span className={styles.cellMuted}>{dateTime(order.created_at)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Buyurtmalar"
        subtitle={data ? `${data.total} ta buyurtma` : 'Yuklanmoqda…'}
      />

      <Toolbar>
        <Tabs
          items={TABS}
          value={filter}
          onChange={(value) => {
            setFilter(value)
            setPage(1)
          }}
          scrollable
        />
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Do‘kon, telefon yoki #raqam"
        />
      </Toolbar>

      {ordersQuery.isPending && <SkeletonList rows={5} height={68} />}

      {ordersQuery.isError && (
        <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
      )}

      {ordersQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="📦"
          title={search ? 'Hech narsa topilmadi' : EMPTY[filter]}
          description={
            search
              ? `"${search}" bo‘yicha natija yo‘q.`
              : 'Yangi buyurtma kelganda shu yerda paydo bo‘ladi.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Qidiruvni tozalash
              </Button>
            ) : undefined
          }
        />
      )}

      {ordersQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(order) => order.id}
            onRowClick={(order) => setSelected(order)}
          />
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}

      {/* ---------- Tafsilot ---------- */}
      <Modal
        open={selected !== null}
        title={selected ? `Buyurtma #${selected.id}` : ''}
        onClose={() => setSelected(null)}
        size="lg"
      >
        {selected && <OrderView order={selected} actions={actions.buttons(selected)} />}
      </Modal>

      {actions.dialogs}
    </>
  )
}
