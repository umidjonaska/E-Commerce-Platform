import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Screen } from '../components/Screen'
import { ProductRow } from '../components/pieces'
import { Button } from '@/components/ui/primitives'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/data'
import { useCart } from '../cart'
import styles from './HomePage.module.css'

const PAGE_SIZE = 20

export default function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const id = Number(categoryId)
  const cart = useCart()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.categories(signal),
  })

  const productsQuery = useQuery({
    queryKey: ['products', id, search, page],
    queryFn: ({ signal }) =>
      api.products({ category_id: id, q: search || undefined, page, size: PAGE_SIZE }, signal),
    enabled: Number.isFinite(id),
  })

  const category = categoriesQuery.data?.find((item) => item.id === id)
  const data = productsQuery.data

  if (!Number.isFinite(id)) {
    return (
      <Screen title="Kategoriya" back>
        <EmptyState icon="❓" title="Kategoriya topilmadi" />
      </Screen>
    )
  }

  return (
    <Screen
      title={category?.name ?? 'Kategoriya'}
      subtitle={data ? `${data.total} ta mahsulot` : undefined}
      back
    >
      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        placeholder="Shu kategoriyada qidirish…"
      />

      {productsQuery.isPending && <SkeletonList rows={5} height={80} />}

      {productsQuery.isError && (
        <ErrorState error={productsQuery.error} onRetry={() => productsQuery.refetch()} />
      )}

      {productsQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon={search ? '🔍' : '📦'}
          title={search ? 'Hech narsa topilmadi' : 'Bu kategoriyada mahsulot yo‘q'}
          description={
            search
              ? 'Boshqa so‘z bilan qidirib ko‘ring.'
              : 'Mahsulotlar qo‘shilgach shu yerda ko‘rinadi.'
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

      {productsQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {data.items.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                to={`/app/product/${product.id}`}
                right={
                  cart.quantityOf(product.id) > 0 ? (
                    <span className={styles.inCart}>{cart.quantityOf(product.id)}</span>
                  ) : (
                    <span className={styles.chevron} aria-hidden="true">
                      ›
                    </span>
                  )
                }
              />
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
