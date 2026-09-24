import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { PrimaryAction, Screen } from '../components/Screen'
import { Button, Card } from '@/components/ui/primitives'
import { ErrorBanner } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form'
import { haptic } from '@/lib/telegram'
import { useAuth, useMe } from '@/store/auth'
import { useToast } from '@/store/toast'
import styles from './ShopEditPage.module.css'

export default function ShopEditPage() {
  const me = useMe()
  const { setMe } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const shop = me.shop

  const [fullName, setFullName] = useState(me.user.full_name ?? '')
  const [name, setName] = useState(shop?.name ?? '')
  const [phone, setPhone] = useState(shop?.phone ?? '')
  const [address, setAddress] = useState(shop?.address ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    shop?.latitude != null && shop?.longitude != null
      ? { lat: shop.latitude, lng: shop.longitude }
      : null,
  )
  const [locating, setLocating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (fullName.trim().length < 2) next.full_name = 'Ismni to‘liq kiriting'
    if (name.trim().length < 2) next.name = 'Do‘kon nomini kiriting'
    if (phone.trim().length < 5) next.phone = 'Telefon raqamini kiriting'
    if (address.trim().length < 3) next.address = 'Manzilni kiriting'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = useMutation({
    mutationFn: () =>
      api.updateShop({
        full_name: fullName.trim(),
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      }),
    onSuccess: (updated) => {
      setMe(updated)
      haptic.success()
      toast.success('Do‘kon ma’lumotlari yangilandi')
      navigate('/app/profile', { replace: true })
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setErrors(error.fieldErrors)
      } else {
        setFormError('Kutilmagan xatolik yuz berdi')
      }
    },
  })

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.info('Qurilmangiz joylashuvni aniqlashni qo‘llab-quvvatlamaydi')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocating(false)
        haptic.success()
        toast.success('Joylashuv yangilandi')
      },
      () => {
        setLocating(false)
        toast.error('Joylashuvni aniqlab bo‘lmadi')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <Screen title="Do‘konni tahrirlash" back>
      {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

      <Card>
        <div className={styles.form}>
          <Field label="Ismingiz" error={errors.full_name} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                invalid={invalid}
                autoComplete="name"
              />
            )}
          </Field>

          <Field label="Do‘kon nomi" error={errors.name} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Telefon" error={errors.phone} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                invalid={invalid}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
            )}
          </Field>

          <Field label="Yetkazib berish manzili" error={errors.address} required>
            {(id, invalid) => (
              <Textarea
                id={id}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                invalid={invalid}
                rows={3}
              />
            )}
          </Field>

          <div className={styles.locationRow}>
            <Button variant="secondary" onClick={detectLocation} loading={locating} icon="📍">
              {coords ? 'Joylashuvni yangilash' : 'Joylashuvni aniqlash'}
            </Button>
            {coords && (
              <div className={styles.locationInfo}>
                <span className={styles.locationOk}>
                  ✓ {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </span>
                <button type="button" className={styles.clearLocation} onClick={() => setCoords(null)}>
                  O‘chirish
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <p className={styles.note}>
        Dillerni o‘zgartirish uchun administrator bilan bog‘laning.
      </p>

      <PrimaryAction
        label="Saqlash"
        onClick={() => {
          setFormError(null)
          if (validate()) save.mutate()
        }}
        loading={save.isPending}
      />
    </Screen>
  )
}
