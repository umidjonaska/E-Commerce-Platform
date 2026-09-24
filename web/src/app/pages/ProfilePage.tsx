import { Link } from 'react-router-dom'
import { Screen, Section } from '../components/Screen'
import { Avatar, Button, Card, InfoRow } from '@/components/ui/primitives'
import { mapHref, telHref } from '@/lib/format'
import { closeApp, isTelegram } from '@/lib/telegram'
import { useAuth, useMe } from '@/store/auth'
import styles from './ProfilePage.module.css'

export default function ProfilePage() {
  const me = useMe()
  const { logout } = useAuth()
  const shop = me.shop
  const diller = shop?.diller

  return (
    <Screen title="Profil">
      <div className={styles.identity}>
        <Avatar name={me.user.full_name || me.user.username} size={56} />
        <div className={styles.identityText}>
          <p className={styles.name}>{me.user.full_name || me.user.username}</p>
          {me.user.phone && <p className={styles.phone}>{me.user.phone}</p>}
        </div>
      </div>

      {/* ---------- Do'kon ---------- */}
      <Section
        title="Do‘kon"
        action={
          <Link to="/app/shop" className={styles.editLink}>
            Tahrirlash
          </Link>
        }
      >
        <Card padded={false}>
          <div className={styles.infoList}>
            <InfoRow label="Nomi">{shop?.name ?? '—'}</InfoRow>
            <InfoRow label="Telefon" href={telHref(shop?.phone)}>
              {shop?.phone ?? '—'}
            </InfoRow>
            <InfoRow label="Manzil">{shop?.address ?? '—'}</InfoRow>
            {mapHref(shop?.latitude ?? null, shop?.longitude ?? null) && (
              <InfoRow
                label="Lokatsiya"
                href={mapHref(shop?.latitude ?? null, shop?.longitude ?? null)}
              >
                Xaritada ochish
              </InfoRow>
            )}
          </div>
        </Card>
      </Section>

      {/* ---------- Diller ---------- */}
      <Section title="Diller">
        {diller ? (
          <Card padded={false}>
            <div className={styles.infoList}>
              <InfoRow label="Nomi">{diller.name}</InfoRow>
              {diller.company_name && diller.company_name !== diller.name && (
                <InfoRow label="Kompaniya">{diller.company_name}</InfoRow>
              )}
              <InfoRow label="Telefon" href={telHref(diller.phone)}>
                {diller.phone ?? '—'}
              </InfoRow>
              <InfoRow label="Hudud">{diller.region ?? '—'}</InfoRow>
              <InfoRow label="Ish vaqti">{diller.work_hours ?? '—'}</InfoRow>
            </div>
          </Card>
        ) : (
          <Card>
            <p className={styles.noDiller}>
              Sizga hozircha diller biriktirilmagan. Buyurtma berish uchun administrator bilan
              bog‘laning.
            </p>
          </Card>
        )}
        <p className={styles.dillerNote}>
          Dillerni faqat administrator o‘zgartira oladi.
        </p>
      </Section>

      {/* ---------- Akkaunt ---------- */}
      <Section title="Akkaunt">
        <Card padded={false}>
          <div className={styles.infoList}>
            <InfoRow label="Login">{me.user.username}</InfoRow>
            {me.user.telegram_id && <InfoRow label="Telegram ID">{me.user.telegram_id}</InfoRow>}
          </div>
        </Card>
      </Section>

      {isTelegram ? (
        <Button variant="ghost" block onClick={closeApp}>
          Ilovani yopish
        </Button>
      ) : (
        <Button variant="ghost" block onClick={logout}>
          Chiqish
        </Button>
      )}
    </Screen>
  )
}
