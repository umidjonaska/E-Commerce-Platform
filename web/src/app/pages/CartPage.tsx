import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PrimaryAction, Screen } from '../components/Screen'
import { ProductThumb } from '../components/pieces'
import { Button } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback'
import { QuantityStepper } from '@/components/ui/form'
import { money, number } from '@/lib/format'
import { useToast } from '@/store/toast'
import { useState } from 'react'
import { useCart } from '../cart'
import styles from './CartPage.module.css'

export default function CartPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmClear, setConfirmClear] = useState(false)

  const ids = cart.lines.map((line) => line.product_id).join(',')

  // Savat ochilganda narx va mavjudlik serverdan qayta tekshiriladi
  const checkQuery = useQuery({
    queryKey: ['cart-check', ids],
    queryFn: ({ signal }) => api.products({ ids, size: 100 }, signal),
    enabled: cart.lines.length > 0,
    staleTime: 0,
  })

  // Har bir javob uchun faqat bir marta moslashtiramiz
  const reconciledFor = useRef<string | null>(null)

  useEffect(() => {
    if (!checkQuery.isSuccess) return
    const key = `${ids}|${checkQuery.dataUpdatedAt}`
    if (reconciledFor.current === key) return
    reconciledFor.current = key

    const removed = cart.reconcile(checkQuery.data.items)
    if (removed.length > 0) {
      toast.error(
        removed.length === 1
          ? `"${removed[0]}" endi mavjud emas va savatdan olib tashlandi`
          : `${removed.length} ta mahsulot endi mavjud emas va savatdan olib tashlandi`,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkQuery.isSuccess, checkQuery.dataUpdatedAt])

  /* ---------------- Bo'sh savat ---------------- */

  if (cart.lines.length === 0) {
    return (
      <Screen title="Savat">
        <EmptyState
          icon="🛒"
          title="Savat bo‘sh"
          description="Katalogdan mahsulot tanlab, savatga qo‘shing."
          action={
            <Button variant="primary" onClick={() => navigate('/app')}>
              Katalogga o‘tish
            </Button>
          }
        />
      </Screen>
    )
  }

  /* ---------------- Tekshiruv ---------------- */

  if (checkQuery.isPending) {
    return (
      <Screen title="Savat">
        <LoadingBlock label="Narxlar tekshirilmoqda…" />
      </Screen>
    )
  }

  if (checkQuery.isError) {
    return (
      <Screen title="Savat">
        <ErrorState error={checkQuery.error} onRetry={() => checkQuery.refetch()} />
      </Screen>
    )
  }

  const invalidLines = cart.lines.filter((line) => line.quantity < line.min_quantity)
  const canOrder = cart.lines.length > 0 && invalidLines.length === 0

  return (
    <Screen
      title="Savat"
      subtitle={`${cart.lines.length} xil mahsulot`}
      action={
        <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
          Tozalash
        </Button>
      }
    >
      <div className={styles.lines}>
        {cart.lines.map((line) => {
          const below = line.quantity < line.min_quantity
          return (
            <div key={line.product_id} className={styles.line}>
              <Link to={`/app/product/${line.product_id}`} className={styles.lineMain}>
                <ProductThumb url={line.image_url} name={line.name} size={48} />
                <span className={styles.lineText}>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={styles.linePrice}>
                    {money(line.price)} / {line.unit}
                  </span>
                </span>
              </Link>

              <div className={styles.lineControls}>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(value) => cart.setQuantity(line.product_id, value)}
                  min={1}
                  size="sm"
                />
                <span className={styles.lineTotal}>{money(line.price * line.quantity)}</span>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => {
                    cart.remove(line.product_id)
                    toast.info(`"${line.name}" savatdan olib tashlandi`)
                  }}
                  aria-label={`${line.name} ni olib tashlash`}
                >
                  🗑
                </button>
              </div>

              {below && (
                <p className={styles.lineWarning}>
                  Minimal miqdor: {number(line.min_quantity)} {line.unit}.{' '}
                  <button
                    type="button"
                    className={styles.fixLink}
                    onClick={() => cart.setQuantity(line.product_id, line.min_quantity)}
                  >
                    To‘g‘rilash
                  </button>
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>Mahsulotlar</span>
          <span>{number(cart.count)} dona</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
          <span>Jami</span>
          <strong>{money(cart.subtotal)}</strong>
        </div>
        <p className={styles.summaryNote}>Yakuniy summani buyurtma berishda server tasdiqlaydi.</p>
      </div>

      <PrimaryAction
        label="Buyurtmani rasmiylashtirish"
        onClick={() => navigate('/app/checkout')}
        disabled={!canOrder}
        hint={
          invalidLines.length > 0 ? (
            <span className={styles.hintError}>Minimal miqdorlarni to‘g‘rilang</span>
          ) : (
            <>
              <span>{number(cart.count)} dona</span>
              <strong>{money(cart.subtotal)}</strong>
            </>
          )
        }
      />

      <ConfirmDialog
        open={confirmClear}
        title="Savatni tozalash"
        message="Savatdagi barcha mahsulotlar o‘chiriladi. Davom etasizmi?"
        confirmLabel="Tozalash"
        danger
        onConfirm={() => {
          cart.clear()
          setConfirmClear(false)
          toast.info('Savat tozalandi')
        }}
        onClose={() => setConfirmClear(false)}
      />
    </Screen>
  )
}
