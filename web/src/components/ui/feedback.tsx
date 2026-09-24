import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError } from '@/lib/api'
import { Button, Spinner } from './primitives'
import styles from './feedback.module.css'

/* ------------------------------------------------------------------ */
/* Yuklanish                                                           */
/* ------------------------------------------------------------------ */

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 'var(--r-sm)',
}: {
  height?: number | string
  width?: number | string
  radius?: string
}) {
  return <span className={styles.skeleton} style={{ height, width, borderRadius: radius }} aria-hidden="true" />
}

export function SkeletonList({ rows = 4, height = 72 }: { rows?: number; height?: number }) {
  return (
    <div className={styles.skeletonList} aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={height} radius="var(--r-lg)" />
      ))}
    </div>
  )
}

export function LoadingBlock({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <div className={styles.center} role="status">
      <Spinner size={26} />
      <p className={styles.centerText}>{label}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bo'sh holat                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.state}>
      <span className={styles.stateIcon} aria-hidden="true">
        {icon}
      </span>
      <h3 className={styles.stateTitle}>{title}</h3>
      {description && <p className={styles.stateText}>{description}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Xato holati                                                         */
/* ------------------------------------------------------------------ */

export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}) {
  const isNetwork = error instanceof ApiError && error.isNetwork
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Kutilmagan xatolik yuz berdi'

  return (
    <div className={`${styles.state} ${styles.errorState} ${compact ? styles.stateCompact : ''}`} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">
        {isNetwork ? '📡' : '⚠️'}
      </span>
      <h3 className={styles.stateTitle}>{isNetwork ? 'Aloqa yo‘q' : 'Xatolik yuz berdi'}</h3>
      <p className={styles.stateText}>{message}</p>
      {onRetry && (
        <div className={styles.stateAction}>
          <Button variant="secondary" onClick={onRetry}>
            Qayta urinish
          </Button>
        </div>
      )}
    </div>
  )
}

/** Inline (forma ustidagi) xato banneri. */
export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.bannerIcon} aria-hidden="true">
        !
      </span>
      <span className={styles.bannerText}>{message}</span>
      {onClose && (
        <button type="button" className={styles.bannerClose} onClick={onClose} aria-label="Yopish">
          ✕
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // Ortqa fon aylanmasligi uchun
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Fokusni modal ichiga olib kiramiz
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={`${styles.modal} ${styles[`modal_${size}`]}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFooter}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Tasdiqlash oynasi                                                   */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Tasdiqlash',
  cancelLabel = 'Bekor qilish',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? () => {} : onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className={styles.confirmText}>{message}</p>}
      {children}
    </Modal>
  )
}
