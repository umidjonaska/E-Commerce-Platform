import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { haptic } from '@/lib/telegram'
import { initials as toInitials } from '@/lib/format'
import type { OrderStatus } from '@/lib/types'
import { STATUS_LABELS } from '@/lib/format'
import styles from './primitives.module.css'

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
  className?: string
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  children,
  disabled,
  onClick,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    block ? styles.block : '',
    loading ? styles.loading : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={(event) => {
        haptic.tap()
        onClick?.(event)
      }}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = '',
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  padded?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <Tag className={`${styles.card} ${padded ? styles.cardPadded : ''} ${className}`}>
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardHeaderText}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.cardAction}>{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode
  tone?: BadgeTone
  dot?: boolean
}) {
  return (
    <span className={`${styles.badge} ${styles[`tone_${tone}`]}`}>
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Buyurtma holati — 4 ta holat vizual jihatdan aniq farqlanadi. */
export function StatusBadge({ status, size = 'md' }: { status: OrderStatus; size?: 'sm' | 'md' }) {
  return (
    <span className={`${styles.status} ${styles[`status_${status}`]} ${size === 'sm' ? styles.statusSm : ''}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}
      aria-hidden="true"
    >
      {toInitials(name)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Spinner                                                             */
/* ------------------------------------------------------------------ */

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={styles.standaloneSpinner}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
      role="status"
      aria-label="Yuklanmoqda"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Ma'lumot qatori (label + qiymat)                                    */
/* ------------------------------------------------------------------ */

export function InfoRow({
  label,
  children,
  href,
}: {
  label: string
  children: ReactNode
  href?: string | null
}) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      {href ? (
        <a className={`${styles.infoValue} ${styles.infoLink}`} href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <span className={styles.infoValue}>{children}</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Statistika plitkasi                                                 */
/* ------------------------------------------------------------------ */

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  loading = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: BadgeTone
  loading?: boolean
}) {
  return (
    <div className={`${styles.statTile} ${styles[`statTone_${tone}`]}`}>
      <span className={styles.statLabel}>{label}</span>
      {loading ? (
        <span className={styles.statSkeleton} aria-hidden="true" />
      ) : (
        <span className={styles.statValue}>{value}</span>
      )}
      {hint && !loading && <span className={styles.statHint}>{hint}</span>}
    </div>
  )
}
