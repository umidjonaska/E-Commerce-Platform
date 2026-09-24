import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Button, StatusBadge } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { DataTable, PageHeader, Pagination, SearchInput, Tabs, Toolbar, type Column, type TabItem } from '@/components/ui/data'
import { OrderView } from '@/components/shared/OrderView'
import { dateTime, money, number, statusLabel } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Order, OrderStatus } from '@/lib/types'
import styles from '@/styles/pages.module.css'

type Filter = OrderStatus | 'all'

const TABS: TabItem<Filter>[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'confirmed', label: 'Qabul qilingan' },
  { value: 'delivered', label: 'Yetkazilgan' },
  { value: 'cancelled', label: 'Bekor qilingan' },
]

/** Superadmin qaysi holatga o'tkaza olishi (backend qoidalariga mos). */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const PAGE_SIZE = 20

export default function AdminOrders() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [dillerFilter, setDillerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Order | null>(null)
  const [changing, setChanging] = useState<{ order: Order; status: OrderStatus } | null>(null)
  const [reason, setReason] = useState('')

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', filter, search, dillerFilter, dateFrom, dateTo, page],
    queryFn: ({ signal }) =>
      api.admin.orders(
        {
          status: filter === 'all' ? '' : filter,
          q: search || undefined,
          diller_id: dillerFilter ? Number(dillerFilter) : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          size: PAGE_SIZE,
        },
        signal,
      ),
  })

  const dillersQuery = useQuery({
    queryKey: ['admin', 'dillers', 'all-for-select'],
    queryFn: ({ signal }) => api.admin.dillers({ size: 100 }, signal),
  })

  const changeStatus = useMutation({
    mutationFn: () =>
      api.admin.changeOrderStatus(changing!.order.id, changing!.status, reason || undefined),
    onSuccess: (order) => {
      toast.success(`Buyurtma #${order.id} holati "${statusLabel(order.status)}" ga o‘zgardi`)
      setSelected(order)
      setChanging(null)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    },
    onError: (error) => {
      setChanging(null)
      setReason('')
      toast.error(error instanceof ApiError ? error.message : 'Holatni o‘zgartirib bo‘lmadi')
      void ordersQuery.refetch()
    },
  })

  const data = ordersQuery.data
  const dillers = dillersQuery.data?.items ?? []
  const hasFilters = Boolean(search || dillerFilter || dateFrom || dateTo || filter !== 'all')

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
    { key: 'diller', header: 'Diller', render: (order) => order.diller_name ?? '—' },
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
  ]

  const statusActions = (order: Order) => {
    const options = NEXT_STATUSES[order.status]
    if (options.length === 0) {
      return <span className={styles.cellMuted}>Bu buyurtma yopilgan, holatini o‘zgartirib bo‘lmaydi.</span>
    }
    return options.map((status) => (
      <Button
        key={status}
        variant={status === 'cancelled' ? 'danger' : status === 'delivered' ? 'primary' : 'success'}
        onClick={() => {
          setChanging({ order, status })
          setReason('')
        }}
      >
        {statusLabel(status)}
      </Button>
    ))
  }

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
        <div style={{ minWidth: 180 }}>
          <Select
            value={dillerFilter}
            onChange={(event) => {
              setDillerFilter(event.target.value)
              setPage(1)
            }}
            aria-label="Diller bo‘yicha filtr"
          >
            <option value="">Barcha dillerlar</option>
            {dillers.map((diller) => (
              <option key={diller.id} value={diller.id}>
                {diller.company_name || diller.full_name || diller.username}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 150 }}>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value)
              setPage(1)
            }}
            aria-label="Boshlanish sanasi"
          />
        </div>
        <div style={{ width: 150 }}>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value)
              setPage(1)
            }}
            aria-label="Tugash sanasi"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('')
              setDillerFilter('')
              setDateFrom('')
              setDateTo('')
              setFilter('all')
              setPage(1)
            }}
          >
            Tozalash
          </Button>
        )}
      </Toolbar>

      {ordersQuery.isPending && <SkeletonList rows={5} height={68} />}

      {ordersQuery.isError && (
        <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
      )}

      {ordersQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="🧾"
          title={hasFilters ? 'Hech narsa topilmadi' : 'Hali buyurtma yo‘q'}
          description={
            hasFilters
              ? 'Filtrlarni o‘zgartirib ko‘ring.'
              : 'Mijozlar buyurtma berganda shu yerda ko‘rinadi.'
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

      <Modal
        open={selected !== null}
        title={selected ? `Buyurtma #${selected.id}` : ''}
        onClose={() => setSelected(null)}
        size="lg"
      >
        {selected && <OrderView order={selected} actions={statusActions(selected)} />}
      </Modal>

      <ConfirmDialog
        open={changing !== null}
        title="Holatni o‘zgartirish"
        message={
          changing
            ? `#${changing.order.id} buyurtma holati "${statusLabel(changing.status)}" ga o‘zgartiriladi. Mijozga xabar yuboriladi.`
            : undefined
        }
        confirmLabel="Tasdiqlash"
        danger={changing?.status === 'cancelled'}
        loading={changeStatus.isPending}
        onConfirm={() => changeStatus.mutate()}
        onClose={() => {
          setChanging(null)
          setReason('')
        }}
      >
        {changing?.status === 'cancelled' && (
          <Field label="Bekor qilish sababi (ixtiyoriy)" hint="Mijoz bu matnni ko‘radi">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
              />
            )}
          </Field>
        )}
      </ConfirmDialog>
    </>
  )
}
