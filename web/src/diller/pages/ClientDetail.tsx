import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardHeader, InfoRow, StatTile, StatusBadge } from '@/components/ui/primitives'
import { EmptyState, ErrorState, LoadingBlock, Modal, SkeletonList } from '@/components/ui/feedback'
import { DataTable, PageHeader, Pagination, type Column } from '@/components/ui/data'
import { OrderView } from '@/components/shared/OrderView'
import { date, dateTime, mapHref, money, number, telHref } from '@/lib/format'
import type { Order } from '@/lib/types'
import { useOrderActions } from '../useOrderActions'
import styles from '@/styles/pages.module.css'

const PAGE_SIZE = 10

export default function DillerClientDetail() {
  const { shopId } = useParams<{ shopId: string }>()
  const id = Number(shopId)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)

  const clientQuery = useQuery({
    queryKey: ['diller', 'client', id],
    queryFn: ({ signal }) => api.diller.client(id, signal),
    enabled: Number.isFinite(id),
  })

  const ordersQuery = useQuery({
    queryKey: ['diller', 'client-orders', id, page],
    queryFn: ({ signal }) => api.diller.orders({ shop_id: id, page, size: PAGE_SIZE }, signal),
    enabled: Number.isFinite(id),
  })

  const actions = useOrderActions(() => setSelected(null))

  if (!Number.isFinite(id)) {
    return <ErrorState error={new Error('Mijoz topilmadi')} />
  }

  if (clientQuery.isPending) {
    return <LoadingBlock label="Mijoz ma’lumotlari yuklanmoqda…" />
  }

  if (clientQuery.isError || !clientQuery.data) {
    return <ErrorState error={clientQuery.error} onRetry={() => clientQuery.refetch()} />
  }

  const client = clientQuery.data
  const orders = ordersQuery.data
  const location = mapHref(client.latitude, client.longitude)

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'Buyurtma',
      primary: true,
      render: (order) => <span className={styles.cellStrong}>#{order.id}</span>,
    },
    {
      key: 'date',
      header: 'Sana',
      render: (order) => <span className={styles.cellMuted}>{dateTime(order.created_at)}</span>,
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
  ]

  return (
    <>
      <Link to="/diller/clients" className={styles.backLink}>
        ← Mijozlar ro‘yxati
      </Link>

      <PageHeader title={client.shop_name} subtitle={client.owner_name ?? undefined} />

      <div className={styles.tiles}>
        <StatTile label="Buyurtmalar" value={number(client.orders_count)} />
        <StatTile label="Jami xaridlar" value={money(client.total_spent)} tone="brand" />
        <StatTile
          label="Oxirgi buyurtma"
          value={client.last_order_at ? date(client.last_order_at) : '—'}
        />
        <StatTile label="Qo‘shilgan" value={date(client.joined_at)} />
      </div>

      <div className={styles.detailGrid}>
        <Card>
          <CardHeader title="Do‘kon ma’lumotlari" />
          <div className={styles.infoList}>
            <InfoRow label="Nomi">{client.shop_name}</InfoRow>
            <InfoRow label="Mas’ul shaxs">{client.owner_name ?? '—'}</InfoRow>
            <InfoRow label="Telefon" href={telHref(client.phone)}>
              {client.phone ?? '—'}
            </InfoRow>
            <InfoRow label="Manzil">{client.address ?? '—'}</InfoRow>
            {location && (
              <InfoRow label="Lokatsiya" href={location}>
                Xaritada ochish ↗
              </InfoRow>
            )}
          </div>
        </Card>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Buyurtmalar tarixi</h2>
        </div>

        {ordersQuery.isPending && <SkeletonList rows={3} height={64} />}

        {ordersQuery.isError && (
          <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} compact />
        )}

        {ordersQuery.isSuccess && orders && orders.items.length === 0 && (
          <Card>
            <EmptyState
              icon="📦"
              title="Buyurtma yo‘q"
              description="Bu mijoz hali buyurtma bermagan."
            />
          </Card>
        )}

        {ordersQuery.isSuccess && orders && orders.items.length > 0 && (
          <>
            <DataTable
              columns={columns}
              rows={orders.items}
              rowKey={(order) => order.id}
              onRowClick={(order) => setSelected(order)}
            />
            <Pagination
              page={orders.page}
              pages={orders.pages}
              total={orders.total}
              onChange={setPage}
            />
          </>
        )}
      </div>

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
