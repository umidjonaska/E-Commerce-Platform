import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Screen, Section } from '../components/Screen'
import { ProductRow } from '../components/pieces'
import { Button, StatusBadge } from '@/components/ui/primitives'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/data'
import { money } from '@/lib/format'
import { useMe } from '@/store/auth'
import { useCart } from '../cart'
import styles from './HomePage.module.css'

const CATEGORY_ICONS = ['🥚', '🥛', '🧃', '🍞', '🧀', '🥫', '🍬', '🧴']

export default function HomePage() {
  const me = useMe()
  const cart = useCart()
  const [search, setSearch] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.categories(signal),
  })

  const searchQuery = useQuery({
    queryKey: ['products', 'search', search],
    queryFn: ({ signal }) => api.products({ q: search, size: 30 }, signal),
    enabled: search.trim().length > 0,
  })

  const lastOrderQuery = useQuery({
    queryKey: ['orders', 'last'],
    queryFn: ({ signal }) => api.myOrders({ size: 1 }, signal),
  })

  const lastOrder = lastOrderQuery.data?.items[0]
  const searching = search.trim().length > 0

  return (
    <Screen>
      <div className={styles.greeting}>
        <p className={styles.hello}>Salom, {me.user.full_name || me.user.username}!</p>
        <h1 className={styles.shopName}>{me.shop?.name}</h1>
        {me.shop?.diller && (
          <Link to="/app/profile" className={styles.dillerChip}>
            <span aria-hidden="true">🚚</span>
            {me.shop.diller.name}
          </Link>
        )}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Mahsulot qidirish…" />

      {/* ---------- Qidiruv natijalari ---------- */}
      {searching && (
        <Section title="Qidiruv natijasi">
          {searchQuery.isPending && <SkeletonList rows={3} height={80} />}

          {searchQuery.isError && (
            <ErrorState error={searchQuery.error} onRetry={() => searchQuery.refetch()} compact />
          )}

          {searchQuery.isSuccess && searchQuery.data.items.length === 0 && (
            <EmptyState
              icon="🔍"
              title="Hech narsa topilmadi"
              description={`"${search}" bo‘yicha mahsulot yo‘q. Boshqa so‘z bilan urinib ko‘ring.`}
              action={
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Qidiruvni tozalash
                </Button>
              }
            />
          )}

          {searchQuery.isSuccess && searchQuery.data.items.length > 0 && (
            <div className={styles.list}>
              {searchQuery.data.items.map((product) => (
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
          )}
        </Section>
      )}

      {/* ---------- Kategoriyalar ---------- */}
      {!searching && (
        <>
          <Section title="Kategoriyalar">
            {categoriesQuery.isPending && (
              <div className={styles.grid}>
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className={styles.categorySkeleton} aria-hidden="true" />
                ))}
              </div>
            )}

            {categoriesQuery.isError && (
              <ErrorState
                error={categoriesQuery.error}
                onRetry={() => categoriesQuery.refetch()}
                compact
              />
            )}

            {categoriesQuery.isSuccess && categoriesQuery.data.length === 0 && (
              <EmptyState
                icon="🗂️"
                title="Katalog hozircha bo‘sh"
                description="Mahsulotlar qo‘shilgach shu yerda ko‘rinadi. Keyinroq qayta kiring."
                action={
                  <Button variant="secondary" onClick={() => categoriesQuery.refetch()}>
                    Yangilash
                  </Button>
                }
              />
            )}

            {categoriesQuery.isSuccess && categoriesQuery.data.length > 0 && (
              <div className={styles.grid}>
                {categoriesQuery.data.map((category, index) => (
                  <Link
                    key={category.id}
                    to={`/app/category/${category.id}`}
                    className={styles.categoryCard}
                  >
                    <span className={styles.categoryIcon} aria-hidden="true">
                      {CATEGORY_ICONS[index % CATEGORY_ICONS.length]}
                    </span>
                    <span className={styles.categoryName}>{category.name}</span>
                    <span className={styles.categoryCount}>
                      {category.products_count} ta mahsulot
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* ---------- Oxirgi buyurtma ---------- */}
          {lastOrder && (
            <Section
              title="Oxirgi buyurtma"
              action={
                <Link to="/app/orders" className={styles.seeAll}>
                  Hammasi
                </Link>
              }
            >
              <Link to={`/app/orders/${lastOrder.id}`} className={styles.lastOrder}>
                <div className={styles.lastOrderTop}>
                  <span className={styles.lastOrderId}>#{lastOrder.id}</span>
                  <StatusBadge status={lastOrder.status} size="sm" />
                </div>
                <div className={styles.lastOrderBottom}>
                  <span className={styles.lastOrderItems}>
                    {lastOrder.items_count} xil mahsulot
                  </span>
                  <span className={styles.lastOrderTotal}>{money(lastOrder.total_amount)}</span>
                </div>
              </Link>
            </Section>
          )}
        </>
      )}

      {/* Savatda mahsulot bo'lsa, tezkor o'tish */}
      {cart.count > 0 && (
        <Link to="/app/cart" className={styles.cartBanner}>
          <span className={styles.cartBannerIcon} aria-hidden="true">
            🛒
          </span>
          <span className={styles.cartBannerText}>
            Savatda {cart.count} dona · {money(cart.subtotal)}
          </span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      )}
    </Screen>
  )
}
