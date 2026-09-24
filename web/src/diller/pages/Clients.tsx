import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/primitives'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { DataTable, PageHeader, Pagination, SearchInput, Toolbar, type Column } from '@/components/ui/data'
import { date, money, number, relative, telHref } from '@/lib/format'
import type { Client } from '@/lib/types'
import styles from '@/styles/pages.module.css'

const PAGE_SIZE = 20

export default function DillerClients() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const clientsQuery = useQuery({
    queryKey: ['diller', 'clients', search, page],
    queryFn: ({ signal }) =>
      api.diller.clients({ q: search || undefined, page, size: PAGE_SIZE }, signal),
  })

  const data = clientsQuery.data

  const columns: Column<Client>[] = [
    {
      key: 'shop',
      header: 'Do‘kon',
      primary: true,
      render: (client) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>{client.shop_name}</span>
          <span className={styles.cellMuted}>{client.owner_name ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      render: (client) =>
        client.phone ? (
          <a
            className={styles.link}
            href={telHref(client.phone) ?? undefined}
            onClick={(event) => event.stopPropagation()}
          >
            {client.phone}
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'address',
      header: 'Manzil',
      hideOnMobile: true,
      render: (client) => <span className={styles.cellMuted}>{client.address ?? '—'}</span>,
    },
    {
      key: 'orders',
      header: 'Buyurtma',
      align: 'right',
      render: (client) => number(client.orders_count),
    },
    {
      key: 'spent',
      header: 'Xaridlar',
      align: 'right',
      render: (client) => <span className={styles.cellStrong}>{money(client.total_spent)}</span>,
    },
    {
      key: 'last',
      header: 'Oxirgi buyurtma',
      render: (client) => (
        <span className={styles.cellMuted}>
          {client.last_order_at ? relative(client.last_order_at) : 'Yo‘q'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Qo‘shilgan',
      hideOnMobile: true,
      render: (client) => <span className={styles.cellMuted}>{date(client.joined_at)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Mijozlar"
        subtitle={data ? `${data.total} ta do‘kon sizga biriktirilgan` : 'Yuklanmoqda…'}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Do‘kon nomi, telefon yoki manzil"
        />
      </Toolbar>

      {clientsQuery.isPending && <SkeletonList rows={5} height={68} />}

      {clientsQuery.isError && (
        <ErrorState error={clientsQuery.error} onRetry={() => clientsQuery.refetch()} />
      )}

      {clientsQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="🏪"
          title={search ? 'Hech narsa topilmadi' : 'Hali mijoz yo‘q'}
          description={
            search
              ? `"${search}" bo‘yicha natija yo‘q.`
              : 'Sizga biriktirilgan do‘konlar shu yerda ko‘rinadi.'
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

      {clientsQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(client) => client.shop_id}
            onRowClick={(client) => navigate(`/diller/clients/${client.shop_id}`)}
          />
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
