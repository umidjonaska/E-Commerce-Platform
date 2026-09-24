import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Screen, Section } from '../components/Screen'
import { Button, Card, InfoRow, StatusBadge } from '@/components/ui/primitives'
import { ConfirmDialog, ErrorState, LoadingBlock } from '@/components/ui/feedback'
import { CANCELLED_BY_LABELS, dateTime, mapHref, money, number, telHref } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Order, OrderStatus } from '@/lib/types'
import styles from './OrderDetailPage.module.css'

const TIMELINE: { status: OrderStatus; label: string; field: keyof Order }[] = [
  { status: 'pending', label: 'Buyurtma berildi', field: 'created_at' },
  { status: 'confirmed', label: 'Diller qabul qildi', field: 'confirmed_at' },
  { status: 'delivered', label: 'Yetkazib berildi', field: 'delivered_at' },
]

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const id = Number(orderId)
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const queryClient = useQueryClient()

  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated ?? false
  const [confirmCancel, setConfirmCancel] = useState(false)

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: ({ signal }) => api.myOrder(id, signal),
    enabled: Number.isFinite(id),
  })

  const cancelOrder = useMutation({
    mutationFn: () => api.cancelOrder(id),
    onSuccess: (order) => {
      queryClient.setQueryData(['order', id], order)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setConfirmCancel(false)
      toast.success('Buyurtma bekor qilindi')
    },
    onError: (error) => {
      setConfirmCancel(false)
      toast.error(error instanceof ApiError ? error.message : 'Bekor qilib bo‘lmadi')
      // Holat o'zgargan bo'lishi mumkin — yangilab olamiz
      void orderQuery.refetch()
    },
  })

  if (!Number.isFinite(id)) {
    return (
      <Screen title="Buyurtma" back>
        <ErrorState error={new Error('Buyurtma topilmadi')} />
      </Screen>
    )
  }

  if (orderQuery.isPending) {
    return (
      <Screen title="Buyurtma" back>
        <LoadingBlock label="Buyurtma yuklanmoqda…" />
      </Screen>
    )
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <Screen title="Buyurtma" back>
        <ErrorState error={orderQuery.error} onRetry={() => orderQuery.refetch()} />
      </Screen>
    )
  }

  const order = orderQuery.data
  const cancelled = order.status === 'cancelled'
  const currentStep = TIMELINE.findIndex((step) => step.status === order.status)

  return (
    <Screen title={`Buyurtma #${order.id}`} back>
      {justCreated && (
        <div className={styles.successBanner}>
          <span className={styles.successIcon} aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>Buyurtmangiz qabul qilindi!</strong>
            <p>Diller tasdiqlagach sizga Telegram orqali xabar keladi.</p>
          </div>
        </div>
      )}

      <div className={styles.statusRow}>
        <StatusBadge status={order.status} />
        <span className={styles.created}>{dateTime(order.created_at)}</span>
      </div>

      {/* ---------- Holat tarixi ---------- */}
      {!cancelled && (
        <Card>
          <ol className={styles.timeline}>
            {TIMELINE.map((step, index) => {
              const done = index <= currentStep
              const time = order[step.field] as string | null
              return (
                <li
                  key={step.status}
                  className={`${styles.timelineItem} ${done ? styles.timelineDone : ''}`}
                >
                  <span className={styles.timelineDot} aria-hidden="true">
                    {done ? '✓' : ''}
                  </span>
                  <span className={styles.timelineText}>
                    <span className={styles.timelineLabel}>{step.label}</span>
                    {time && <span className={styles.timelineTime}>{dateTime(time)}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {cancelled && (
        <Card className={styles.cancelledCard}>
          <p className={styles.cancelledTitle}>
            {order.cancelled_by ? CANCELLED_BY_LABELS[order.cancelled_by] : 'Bekor qilindi'}
          </p>
          {order.cancelled_at && (
            <p className={styles.cancelledTime}>{dateTime(order.cancelled_at)}</p>
          )}
          {order.reject_reason && (
            <p className={styles.cancelledReason}>Sabab: {order.reject_reason}</p>
          )}
        </Card>
      )}

      {/* ---------- Mahsulotlar ---------- */}
      <Section title="Mahsulotlar">
        <Card padded={false}>
          <ul className={styles.items}>
            {order.items.map((item) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.itemName}>{item.product_name}</span>
                <span className={styles.itemQty}>
                  {number(item.quantity)} {item.unit} × {money(item.unit_price)}
                </span>
                <span className={styles.itemTotal}>{money(item.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.total}>
            <span>Jami</span>
            <strong>{money(order.total_amount)}</strong>
          </div>
        </Card>
      </Section>

      {/* ---------- Yetkazib berish ---------- */}
      <Section title="Yetkazib berish">
        <Card padded={false}>
          <div className={styles.infoList}>
            <InfoRow label="Do‘kon">{order.shop_name ?? '—'}</InfoRow>
            <InfoRow label="Mijoz">{order.customer_name ?? '—'}</InfoRow>
            <InfoRow label="Telefon" href={telHref(order.customer_phone)}>
              {order.customer_phone ?? '—'}
            </InfoRow>
            <InfoRow label="Manzil">{order.delivery_address ?? '—'}</InfoRow>
            {mapHref(order.latitude, order.longitude) && (
              <InfoRow label="Lokatsiya" href={mapHref(order.latitude, order.longitude)}>
                Xaritada ochish
              </InfoRow>
            )}
            {order.note && <InfoRow label="Izoh">{order.note}</InfoRow>}
          </div>
        </Card>
      </Section>

      {/* ---------- Diller ---------- */}
      {order.diller_name && (
        <Section title="Diller">
          <Card padded={false}>
            <div className={styles.infoList}>
              <InfoRow label="Nomi">{order.diller_name}</InfoRow>
            </div>
          </Card>
        </Section>
      )}

      {/* ---------- Amallar ---------- */}
      {(order.can_edit || order.can_cancel) && (
        <div className={styles.actions}>
          {order.can_edit && (
            <Button
              variant="secondary"
              size="lg"
              block
              onClick={() => navigate(`/app/orders/${order.id}/edit`)}
            >
              Tahrirlash
            </Button>
          )}
          {order.can_cancel && (
            <Button
              variant="danger"
              size="lg"
              block
              onClick={() => setConfirmCancel(true)}
              loading={cancelOrder.isPending}
            >
              Bekor qilish
            </Button>
          )}
        </div>
      )}

      {!order.can_edit && !cancelled && order.status !== 'delivered' && (
        <p className={styles.lockNote}>
          Buyurtma diller tomonidan qabul qilingan, shuning uchun uni o‘zgartirib bo‘lmaydi.
          Kerak bo‘lsa diller bilan bog‘laning.
        </p>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Buyurtmani bekor qilish"
        message={`#${order.id} raqamli buyurtma bekor qilinadi. Bu amalni qaytarib bo‘lmaydi.`}
        confirmLabel="Ha, bekor qilish"
        cancelLabel="Yo‘q"
        danger
        loading={cancelOrder.isPending}
        onConfirm={() => cancelOrder.mutate()}
        onClose={() => setConfirmCancel(false)}
      />
    </Screen>
  )
}
