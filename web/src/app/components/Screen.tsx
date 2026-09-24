import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'
import { isTelegram } from '@/lib/telegram'
import { useMainButton } from '@/lib/useTelegramUI'
import styles from './Screen.module.css'

/**
 * Mini App sahifasi uchun umumiy o'ram.
 *
 * `back` berilsa, Telegram tashqarisida (brauzerda) ko'rinadigan orqaga tugmasi
 * chiziladi — Telegram ichida bu vazifani tizim BackButton'i bajaradi.
 */
export function Screen({
  title,
  subtitle,
  back = false,
  action,
  children,
}: {
  title?: string
  subtitle?: ReactNode
  back?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const showBack = back && !isTelegram

  return (
    <div className={styles.screen}>
      {(title || showBack || action) && (
        <header className={styles.header}>
          {showBack && (
            <button
              type="button"
              className={styles.back}
              onClick={() => navigate(-1)}
              aria-label="Orqaga"
            >
              ←
            </button>
          )}
          {title && (
            <div className={styles.headerText}>
              <h1 className={styles.title}>{title}</h1>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          )}
          {action && <div className={styles.headerAction}>{action}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  )
}

/**
 * Asosiy amal tugmasi.
 *
 * Telegram ichida — tizimning MainButton'i, brauzerda — pastda turadigan
 * yopishqoq tugma. Ikkala holatda ham bitta `onClick` ishlaydi.
 */
export function PrimaryAction({
  label,
  onClick,
  loading = false,
  disabled = false,
  visible = true,
  hint,
  secondary,
}: {
  label: string
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  visible?: boolean
  hint?: ReactNode
  secondary?: ReactNode
}) {
  useMainButton({ text: label, visible: visible && isTelegram, loading, disabled, onClick })

  if (!visible || isTelegram) {
    // Telegram ichida tugma tizim panelida — sahifada joy egallamaydi,
    // lekin hint ko'rsatilishi kerak bo'lsa ko'rsatamiz.
    return isTelegram && hint && visible ? (
      <div className={styles.hintOnly}>{hint}</div>
    ) : null
  }

  return (
    <div className={styles.stickyBar}>
      {hint && <div className={styles.stickyHint}>{hint}</div>}
      <div className={styles.stickyButtons}>
        {secondary}
        <Button
          variant="primary"
          size="lg"
          block
          loading={loading}
          disabled={disabled}
          onClick={onClick}
        >
          {label}
        </Button>
      </div>
    </div>
  )
}

/** Sahifa bo'limi (sarlavha + tarkib). */
export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`${styles.section} ${className}`}>
      {(title || action) && (
        <div className={styles.sectionHead}>
          {title && <h2 className={styles.sectionTitle}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
