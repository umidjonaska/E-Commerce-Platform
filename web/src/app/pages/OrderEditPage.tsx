import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { PrimaryAction, Screen, Section } from '../components/Screen'
import { ProductThumb } from '../components/pieces'
import { Button, Card } from '@/components/ui/primitives'
import { ErrorBanner, ErrorState, LoadingBlock, Modal, SkeletonList } from '@/components/ui/feedback'
import { QuantityStepper, Textarea } from '@/components/ui/form'
import { SearchInput } from '@/components/ui/data'
import { money, number } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Product } from '@/lib/types'
import styles from './CartPage.module.css'
import editStyles from './OrderEditPage.module.css'

interface DraftLine {
  product_id: number
  name: string
  unit: string
  price: number
  min_quantity: number
  quantity: number
  image_url: string | null
  /** Mahsulot katalogdan olib tashlangan bo'lsa true */
  missing: boolean
}

export default function OrderEditPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const id = Number(orderId)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState<DraftLine[] | null>(null)
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: ({ signal }) => api.myOrder(id, signal),
    enabled: Number.isFinite(id),
  })

  const order = orderQuery.data
  const productIds = order?.items.map((item) => item.product_id).filter((x): x is number => x !== null) ?? []

  const productsQuery = useQuery({
    queryKey: ['order-edit-products', id, productIds.join(',')],
    queryFn: ({ signal }) => api.products({ ids: productIds.join(','), size: 100 }, signal),
    enabled: Boolean(order) && productIds.length > 0,
  })

  // Buyurtma va katalog yuklangach tahrirlash uchun nusxa tayyorlanadi
  useEffect(() => {
    if (!order) return
    if (productIds.length > 0 && !productsQuery.isSuccess) return

    const available = new Map((productsQuery.data?.items ?? []).map((p) => [p.id, p]))

    setDraft(
      order.items.map((item) => {
        const product = item.product_id !== null ? available.get(item.product_id) : undefined
        return {
          product_id: item.product_id ?? -1,
          name: product?.name ?? item.product_name,
          unit: product?.unit ?? item.unit,
          price: product?.price ?? item.unit_price,
          min_quantity: product?.min_quantity ?? 1,
          quantity: item.quantity,
          image_url: product?.image_url ?? null,
          missing: !product,
        }
      }),
    )
    setNote(order.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, productsQuery.isSuccess, productsQuery.dataUpdatedAt])

  const searchQuery = useQuery({
    queryKey: ['products', 'picker', search],
    queryFn: ({ signal }) => api.products({ q: search || undefined, size: 30 }, signal),
    enabled: picker,
  })

  const save = useMutation({
    mutationFn: () =>
      api.updateOrder(id, {
        items: (draft ?? [])
          .filter((line) => !line.missing)
          .map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
        note: note.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', id], updated)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Buyurtma yangilandi')
      navigate(`/app/orders/${id}`, { replace: true })
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Saqlab bo‘lmadi')
      if (error instanceof ApiError && error.status === 409) {
        // Buyurtma holati o'zgargan — tafsilotga qaytaramiz
        void orderQuery.refetch()
      }
    },
  })

  /* ---------------- Holatlar ---------------- */

  if (!Number.isFinite(id)) {
    return (
      <Screen title="Tahrirlash" back>
        <ErrorState error={new Error('Buyurtma topilmadi')} />
      </Screen>
    )
  }

  if (orderQuery.isPending || (productIds.length > 0 && productsQuery.isPending) || !draft) {
    return (
      <Screen title="Buyurtmani tahrirlash" back>
        <LoadingBlock label="Yuklanmoqda…" />
      </Screen>
    )
  }

  if (orderQuery.isError || !order) {
    return (
      <Screen title="Buyurtmani tahrirlash" back>
        <ErrorState error={orderQuery.error} onRetry={() => orderQuery.refetch()} />
      </Screen>
    )
  }

  if (!order.can_edit) {
    return (
      <Screen title="Buyurtmani tahrirlash" back>
        <ErrorState
          error={new Error('Bu buyurtmani endi tahrirlab bo‘lmaydi — u allaqachon qabul qilingan.')}
        />
        <Button variant="primary" block onClick={() => navigate(`/app/orders/${id}`, { replace: true })}>
          Buyurtmaga qaytish
        </Button>
      </Screen>
    )
  }

  /* ---------------- Hisob-kitob ---------------- */

  const usable = draft.filter((line) => !line.missing)
  const subtotal = usable.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const invalid = usable.filter((line) => line.quantity < line.min_quantity)
  const canSave = usable.length > 0 && invalid.length === 0

  const setQuantity = (productId: number, quantity: number) => {
    setDraft((current) =>
      (current ?? []).map((line) =>
        line.product_id === productId ? { ...line, quantity } : line,
      ),
    )
  }

  const removeLine = (productId: number) => {
    setDraft((current) => (current ?? []).filter((line) => line.product_id !== productId))
  }

  const addProduct = (product: Product) => {
    setDraft((current) => {
      const lines = current ?? []
      const existing = lines.find((line) => line.product_id === product.id)
      if (existing) {
        toast.info('Bu mahsulot allaqachon buyurtmada')
        return lines
      }
      return [
        ...lines,
        {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          price: product.price,
          min_quantity: product.min_quantity,
          quantity: product.min_quantity,
          image_url: product.image_url,
          missing: false,
        },
      ]
    })
    setPicker(false)
    setSearch('')
    toast.success(`"${product.name}" qo‘shildi`)
  }

  return (
    <Screen title={`#${order.id} — tahrirlash`} back>
      {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

      <Section
        title="Mahsulotlar"
        action={
          <Button size="sm" variant="secondary" onClick={() => setPicker(true)}>
            + Qo‘shish
          </Button>
        }
      >
        {usable.length === 0 && (
          <Card>
            <p className={editStyles.emptyNote}>
              Buyurtmada mahsulot qolmadi. Kamida bitta mahsulot qo‘shing yoki buyurtmani bekor
              qiling.
            </p>
          </Card>
        )}

        <div className={styles.lines}>
          {draft.map((line) => (
            <div key={line.product_id} className={styles.line}>
              <div className={styles.lineMain}>
                <ProductThumb url={line.image_url} name={line.name} size={48} />
                <span className={styles.lineText}>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={styles.linePrice}>
                    {money(line.price)} / {line.unit}
                  </span>
                </span>
              </div>

              {line.missing ? (
                <p className={styles.lineWarning}>
                  Bu mahsulot endi sotuvda yo‘q va buyurtmadan olib tashlanadi.
                </p>
              ) : (
                <>
                  <div className={styles.lineControls}>
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(value) => setQuantity(line.product_id, value)}
                      min={1}
                      size="sm"
                    />
                    <span className={styles.lineTotal}>{money(line.price * line.quantity)}</span>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeLine(line.product_id)}
                      aria-label={`${line.name} ni olib tashlash`}
                    >
                      🗑
                    </button>
                  </div>

                  {line.quantity < line.min_quantity && (
                    <p className={styles.lineWarning}>
                      Minimal miqdor: {number(line.min_quantity)} {line.unit}.{' '}
                      <button
                        type="button"
                        className={styles.fixLink}
                        onClick={() => setQuantity(line.product_id, line.min_quantity)}
                      >
                        To‘g‘rilash
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Izoh">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Diller uchun izoh"
          maxLength={1000}
        />
      </Section>

      <div className={styles.summary}>
        <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
          <span>Yangi summa</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <p className={styles.summaryNote}>
          Avvalgi summa: {money(order.total_amount)}. Yakuniy summani server tasdiqlaydi.
        </p>
      </div>

      <PrimaryAction
        label="O‘zgarishlarni saqlash"
        onClick={() => {
          setFormError(null)
          save.mutate()
        }}
        loading={save.isPending}
        disabled={!canSave}
        hint={
          invalid.length > 0 ? (
            <span className={styles.hintError}>Minimal miqdorlarni to‘g‘rilang</span>
          ) : usable.length === 0 ? (
            <span className={styles.hintError}>Kamida bitta mahsulot kerak</span>
          ) : (
            <>
              <span>{number(usable.length)} xil</span>
              <strong>{money(subtotal)}</strong>
            </>
          )
        }
      />

      {/* ---------- Mahsulot tanlash ---------- */}
      <Modal open={picker} title="Mahsulot qo‘shish" onClose={() => setPicker(false)} size="md">
        <SearchInput value={search} onChange={setSearch} placeholder="Mahsulot qidirish…" />

        <div className={editStyles.pickerList}>
          {searchQuery.isPending && <SkeletonList rows={4} height={64} />}

          {searchQuery.isError && (
            <ErrorState error={searchQuery.error} onRetry={() => searchQuery.refetch()} compact />
          )}

          {searchQuery.isSuccess && searchQuery.data.items.length === 0 && (
            <p className={editStyles.emptyNote}>Mahsulot topilmadi.</p>
          )}

          {searchQuery.isSuccess &&
            searchQuery.data.items.map((product) => {
              const already = draft.some((line) => line.product_id === product.id)
              return (
                <button
                  key={product.id}
                  type="button"
                  className={editStyles.pickerItem}
                  onClick={() => addProduct(product)}
                  disabled={already}
                >
                  <ProductThumb url={product.image_url} name={product.name} size={40} />
                  <span className={editStyles.pickerText}>
                    <span className={editStyles.pickerName}>{product.name}</span>
                    <span className={editStyles.pickerPrice}>
                      {money(product.price)} / {product.unit}
                    </span>
                  </span>
                  <span className={editStyles.pickerAdd}>{already ? '✓' : '+'}</span>
                </button>
              )
            })}
        </div>
      </Modal>
    </Screen>
  )
}
