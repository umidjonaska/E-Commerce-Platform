import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Button } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/form'
import { useToast } from '@/store/toast'
import type { Order } from '@/lib/types'

/**
 * Diller buyurtma ustidagi amallari: qabul qilish, rad etish, yetkazildi deb belgilash.
 *
 * Qaysi tugma ko'rinishi backend qoidalariga mos: PENDING -> qabul/rad,
 * CONFIRMED -> yetkazildi/bekor. Yopilgan buyurtmada tugma bo'lmaydi.
 */
export function useOrderActions(onDone?: () => void) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [rejecting, setRejecting] = useState<Order | null>(null)
  const [reason, setReason] = useState('')
  const [delivering, setDelivering] = useState<Order | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['diller'] })
    void queryClient.invalidateQueries({ queryKey: ['order'] })
    onDone?.()
  }

  const fail = (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : 'Amalni bajarib bo‘lmadi')
    invalidate()
  }

  const accept = useMutation({
    mutationFn: (id: number) => api.diller.accept(id),
    onSuccess: (order) => {
      toast.success(`Buyurtma #${order.id} qabul qilindi`)
      invalidate()
    },
    onError: fail,
  })

  const reject = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.diller.reject(id, text),
    onSuccess: (order) => {
      toast.success(`Buyurtma #${order.id} rad etildi`)
      setRejecting(null)
      setReason('')
      invalidate()
    },
    onError: (error) => {
      setRejecting(null)
      setReason('')
      fail(error)
    },
  })

  const deliver = useMutation({
    mutationFn: (id: number) => api.diller.deliver(id),
    onSuccess: (order) => {
      toast.success(`Buyurtma #${order.id} yetkazildi deb belgilandi`)
      setDelivering(null)
      invalidate()
    },
    onError: (error) => {
      setDelivering(null)
      fail(error)
    },
  })

  const busy = accept.isPending || reject.isPending || deliver.isPending

  /** Buyurtma holatiga mos tugmalar. */
  const buttons = (order: Order, size: 'sm' | 'md' = 'md') => {
    if (order.status === 'pending') {
      return (
        <>
          <Button
            variant="success"
            size={size}
            loading={accept.isPending && accept.variables === order.id}
            disabled={busy}
            onClick={() => accept.mutate(order.id)}
          >
            Qabul qilish
          </Button>
          <Button variant="danger" size={size} disabled={busy} onClick={() => setRejecting(order)}>
            Rad etish
          </Button>
        </>
      )
    }

    if (order.status === 'confirmed') {
      return (
        <>
          <Button
            variant="primary"
            size={size}
            disabled={busy}
            onClick={() => setDelivering(order)}
          >
            Yetkazildi
          </Button>
          <Button variant="danger" size={size} disabled={busy} onClick={() => setRejecting(order)}>
            Bekor qilish
          </Button>
        </>
      )
    }

    return null
  }

  /** Modal oynalar — sahifa tarkibiga bir marta qo'yiladi. */
  const dialogs = (
    <>
      <ConfirmDialog
        open={rejecting !== null}
        title={
          rejecting?.status === 'confirmed' ? 'Buyurtmani bekor qilish' : 'Buyurtmani rad etish'
        }
        message={
          rejecting
            ? `#${rejecting.id} — ${rejecting.shop_name ?? 'mijoz'}. Mijozga xabar yuboriladi.`
            : undefined
        }
        confirmLabel={rejecting?.status === 'confirmed' ? 'Bekor qilish' : 'Rad etish'}
        danger
        loading={reject.isPending}
        onConfirm={() => {
          if (rejecting) reject.mutate({ id: rejecting.id, text: reason })
        }}
        onClose={() => {
          setRejecting(null)
          setReason('')
        }}
      >
        <Field label="Sabab (ixtiyoriy)" hint="Mijoz bu matnni ko‘radi">
          {(id) => (
            <Textarea
              id={id}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Masalan: mahsulot vaqtincha tugagan"
            />
          )}
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={delivering !== null}
        title="Yetkazildi deb belgilash"
        message={
          delivering
            ? `#${delivering.id} buyurtma yetkazib berildi deb belgilanadi. Bu amalni qaytarib bo‘lmaydi.`
            : undefined
        }
        confirmLabel="Ha, yetkazildi"
        loading={deliver.isPending}
        onConfirm={() => {
          if (delivering) deliver.mutate(delivering.id)
        }}
        onClose={() => setDelivering(null)}
      />
    </>
  )

  return { buttons, dialogs, busy }
}
