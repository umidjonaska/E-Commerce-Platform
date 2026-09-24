import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { PrimaryAction, Screen, Section } from '../components/Screen'
import { Card } from '@/components/ui/primitives'
import { ErrorBanner } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/form'
import { money, number } from '@/lib/format'
import { haptic } from '@/lib/telegram'
import { useMe } from '@/store/auth'
import { useToast } from '@/store/toast'
import { useCart } from '../cart'
import styles from './CheckoutPage.module.css'

export default function CheckoutPage() {
  const me = useMe()
  const cart = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [address, setAddress] = useState(me.shop?.address ?? '')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Buyurtma berilgach savat bo'shaydi. Shu payt quyidagi "savat bo'sh" himoyasi
  // ishga tushib, foydalanuvchini tasdiq sahifasi o'rniga savatga qaytarib
  // yubormasligi uchun belgilab qo'yamiz.
  const placedRef = useRef(false)

  const createOrder = useMutation({
    mutationFn: () =>
      api.createOrder({
        items: cart.lines.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
        })),
        note: note.trim() || null,
        delivery_address: address.trim() || null,
      }),
    onSuccess: (order) => {
      placedRef.current = true
      cart.clear()
      haptic.success()
      toast.success(`Buyurtma #${order.id} qabul qilindi!`)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/app/orders/${order.id}`, { replace: true, state: { justCreated: true } })
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setFieldErrors(error.fieldErrors)
        // Savatdagi mahsulot yaroqsiz bo'lsa, foydalanuvchini savatga qaytaramiz
        if (error.status === 422 && error.fieldErrors.items === undefined) {
          toast.error(error.message)
        }
      } else {
        setFormError('Kutilmagan xatolik yuz berdi')
      }
    },
  })

  // Savat bo'sh bo'lsa bu sahifaning ma'nosi yo'q (buyurtma berilgan holat bundan mustasno)
  if (cart.lines.length === 0 && !placedRef.current) {
    return <Navigate to="/app/cart" replace />
  }

  const diller = me.shop?.diller

  return (
    <Screen title="Buyurtmani tasdiqlash" back>
      {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

      <Section title="Mahsulotlar">
        <Card padded={false}>
          <ul className={styles.items}>
            {cart.lines.map((line) => (
              <li key={line.product_id} className={styles.item}>
                <span className={styles.itemName}>{line.name}</span>
                <span className={styles.itemQty}>
                  {number(line.quantity)} {line.unit} × {money(line.price)}
                </span>
                <span className={styles.itemTotal}>{money(line.price * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.total}>
            <span>Jami</span>
            <strong>{money(cart.subtotal)}</strong>
          </div>
        </Card>
      </Section>

      <Section title="Yetkazib berish">
        <Card>
          <Field
            label="Manzil"
            error={fieldErrors.delivery_address}
            hint="Bo‘sh qoldirsangiz do‘kon manzili ishlatiladi"
          >
            {(id, invalid) => (
              <Textarea
                id={id}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                invalid={invalid}
                rows={2}
                placeholder="Yetkazib berish manzili"
              />
            )}
          </Field>

          <div className={styles.spacer} />

          <Field label="Izoh (ixtiyoriy)" error={fieldErrors.note}>
            {(id, invalid) => (
              <Textarea
                id={id}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                invalid={invalid}
                rows={2}
                placeholder="Masalan: ertalab yetkazing"
                maxLength={1000}
              />
            )}
          </Field>
        </Card>
      </Section>

      {diller && (
        <Section title="Diller">
          <Card>
            <p className={styles.dillerName}>{diller.name}</p>
            {diller.phone && <p className={styles.dillerMeta}>📞 {diller.phone}</p>}
            {diller.work_hours && <p className={styles.dillerMeta}>🕒 {diller.work_hours}</p>}
            <p className={styles.dillerHint}>
              Buyurtmangiz shu dillerga yuboriladi. U qabul qilgach sizga xabar keladi.
            </p>
          </Card>
        </Section>
      )}

      <PrimaryAction
        label="Buyurtma berish"
        onClick={() => {
          setFormError(null)
          createOrder.mutate()
        }}
        loading={createOrder.isPending}
        hint={
          <>
            <span>{number(cart.count)} dona</span>
            <strong>{money(cart.subtotal)}</strong>
          </>
        }
      />
    </Screen>
  )
}
