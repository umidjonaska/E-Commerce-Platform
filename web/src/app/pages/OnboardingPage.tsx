import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Button, Card, Spinner } from '@/components/ui/primitives'
import { ErrorBanner, ErrorState, LoadingBlock } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form'
import { useAuth } from '@/store/auth'
import { useToast } from '@/store/toast'
import { haptic, telegramUser } from '@/lib/telegram'
import type { DillerPublic } from '@/lib/types'
import styles from './OnboardingPage.module.css'

type Step = 'intro' | 'shop' | 'diller'

export default function OnboardingPage() {
  const { setMe } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState<Step>('intro')
  const [fullName, setFullName] = useState(() => {
    const user = telegramUser()
    return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  })
  const [shopName, setShopName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [dillerId, setDillerId] = useState<number | null>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dillersQuery = useQuery({
    queryKey: ['public-dillers'],
    queryFn: ({ signal }) => api.publicDillers(signal),
    enabled: step === 'diller',
  })

  const validateShop = (): boolean => {
    const next: Record<string, string> = {}
    if (fullName.trim().length < 2) next.full_name = 'Ismingizni to‘liq kiriting'
    if (shopName.trim().length < 2) next.name = 'Do‘kon nomini kiriting'
    if (phone.trim().length < 5) next.phone = 'Telefon raqamini kiriting'
    if (address.trim().length < 3) next.address = 'Manzilni kiriting'
    setErrors(next)
    return Object.keys(next).length === 0
  }

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
        toast.success('Joylashuv qo‘shildi')
      },
      () => {
        setLocating(false)
        toast.error('Joylashuvni aniqlab bo‘lmadi. Manzilni qo‘lda yozing.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!dillerId) {
      setFormError('Dillerni tanlang')
      return
    }

    setSaving(true)
    try {
      const me = await api.registerShop({
        full_name: fullName.trim(),
        name: shopName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        diller_id: dillerId,
      })
      setMe(me)
      toast.success('Ro‘yxatdan o‘tdingiz! Endi buyurtma berishingiz mumkin.')
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setErrors(error.fieldErrors)
        // Maydon xatosi bo'lsa, foydalanuvchini tegishli qadamga qaytaramiz
        if (Object.keys(error.fieldErrors).some((key) => key !== 'diller_id')) setStep('shop')
      } else {
        setFormError('Kutilmagan xatolik yuz berdi')
      }
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- 1-qadam: tanishtirish ---------------- */

  if (step === 'intro') {
    return (
      <div className={styles.page}>
        <div className={styles.intro}>
          <span className={styles.introIcon} aria-hidden="true">
            🛒
          </span>
          <h1 className={styles.introTitle}>Xush kelibsiz!</h1>
          <p className={styles.introText}>
            Bu ilova orqali do‘koningiz uchun mahsulot buyurtma qilasiz. Buyurtmangiz
            to‘g‘ridan-to‘g‘ri dilleringizga boradi.
          </p>

          <ul className={styles.steps}>
            <li>
              <span className={styles.stepNum}>1</span>
              <div>
                <strong>Do‘kon ma’lumotlari</strong>
                <p>Nomi, telefon va yetkazib berish manzili</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNum}>2</span>
              <div>
                <strong>Dillerni tanlash</strong>
                <p>Sizga mahsulot yetkazib beradigan hamkor</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNum}>3</span>
              <div>
                <strong>Buyurtma berish</strong>
                <p>Katalogdan tanlab, savatga qo‘shasiz</p>
              </div>
            </li>
          </ul>

          <Button variant="primary" size="lg" block onClick={() => setStep('shop')}>
            Boshlash
          </Button>
        </div>
      </div>
    )
  }

  /* ---------------- 2-qadam: do'kon ---------------- */

  if (step === 'shop') {
    return (
      <div className={styles.page}>
        <div className={styles.form}>
          <header className={styles.formHeader}>
            <span className={styles.progress}>1 / 2-qadam</span>
            <h1 className={styles.formTitle}>Do‘kon ma’lumotlari</h1>
          </header>

          {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

          <Field label="Ismingiz" error={errors.full_name} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                invalid={invalid}
                placeholder="Aziz Karimov"
                autoComplete="name"
              />
            )}
          </Field>

          <Field label="Do‘kon nomi" error={errors.name} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                invalid={invalid}
                placeholder="Aziz Market"
              />
            )}
          </Field>

          <Field label="Telefon" error={errors.phone} required hint="Diller siz bilan shu raqam orqali bog‘lanadi">
            {(id, invalid) => (
              <Input
                id={id}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                invalid={invalid}
                placeholder="+998 90 123 45 67"
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
                placeholder="Toshkent sh., Chilonzor t., 5-kvartal, 12-uy"
                rows={3}
              />
            )}
          </Field>

          <div className={styles.locationRow}>
            <Button variant="secondary" onClick={detectLocation} loading={locating} icon="📍">
              {coords ? 'Joylashuvni yangilash' : 'Joylashuvni aniqlash'}
            </Button>
            {coords && (
              <span className={styles.locationOk}>
                ✓ {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </span>
            )}
          </div>

          <div className={styles.formActions}>
            <Button variant="ghost" onClick={() => setStep('intro')}>
              Orqaga
            </Button>
            <Button
              variant="primary"
              size="lg"
              className={styles.grow}
              onClick={() => {
                if (validateShop()) setStep('diller')
              }}
            >
              Davom etish
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------- 3-qadam: diller ---------------- */

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={submit}>
        <header className={styles.formHeader}>
          <span className={styles.progress}>2 / 2-qadam</span>
          <h1 className={styles.formTitle}>Dillerni tanlang</h1>
          <p className={styles.formHint}>
            Diller sizning buyurtmalaringizni qabul qiladi va yetkazib beradi.
          </p>
        </header>

        {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

        {dillersQuery.isPending && <LoadingBlock label="Dillerlar yuklanmoqda…" />}

        {dillersQuery.isError && (
          <ErrorState error={dillersQuery.error} onRetry={() => dillersQuery.refetch()} compact />
        )}

        {dillersQuery.isSuccess && dillersQuery.data.length === 0 && (
          <Card>
            <p className={styles.noDillers}>
              Hozircha faol diller yo‘q. Iltimos, keyinroq urinib ko‘ring yoki administrator bilan
              bog‘laning.
            </p>
            <Button block variant="secondary" onClick={() => dillersQuery.refetch()}>
              Yangilash
            </Button>
          </Card>
        )}

        {dillersQuery.isSuccess && dillersQuery.data.length > 0 && (
          <div className={styles.dillerList}>
            {dillersQuery.data.map((diller: DillerPublic) => (
              <label
                key={diller.id}
                className={`${styles.dillerCard} ${dillerId === diller.id ? styles.dillerActive : ''}`}
              >
                <input
                  type="radio"
                  name="diller"
                  value={diller.id}
                  checked={dillerId === diller.id}
                  onChange={() => {
                    haptic.select()
                    setDillerId(diller.id)
                    setFormError(null)
                  }}
                  className={styles.dillerRadio}
                />
                <span className={styles.dillerBody}>
                  <span className={styles.dillerName}>{diller.name}</span>
                  {diller.region && <span className={styles.dillerMeta}>📍 {diller.region}</span>}
                  {diller.phone && <span className={styles.dillerMeta}>📞 {diller.phone}</span>}
                  {diller.work_hours && (
                    <span className={styles.dillerMeta}>🕒 {diller.work_hours}</span>
                  )}
                </span>
                <span className={styles.dillerCheck} aria-hidden="true">
                  {dillerId === diller.id ? '✓' : ''}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className={styles.formActions}>
          <Button variant="ghost" onClick={() => setStep('shop')} disabled={saving}>
            Orqaga
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.grow}
            loading={saving}
            disabled={!dillerId || dillersQuery.isPending}
          >
            Ro‘yxatdan o‘tish
          </Button>
        </div>

        {saving && (
          <p className={styles.savingNote}>
            <Spinner size={14} /> Ma’lumotlar saqlanmoqda…
          </p>
        )}
      </form>
    </div>
  )
}
