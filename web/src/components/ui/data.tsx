import { useEffect, useState, type ReactNode } from 'react'
import { Button } from './primitives'
import { Input } from './form'
import styles from './data.module.css'

/* ------------------------------------------------------------------ */
/* Jadval — desktopda jadval, mobilda kartalar                         */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string
  header: ReactNode
  /** Mobil kartada sarlavha sifatida ishlatiladi */
  primary?: boolean
  align?: 'left' | 'right' | 'center'
  width?: string
  /** Mobil kartada ko'rsatilmaydi (masalan, takrorlanuvchi ustun) */
  hideOnMobile?: boolean
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyLabel = "Ma'lumot yo'q",
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  emptyLabel?: string
}) {
  if (rows.length === 0) {
    return <p className={styles.tableEmpty}>{emptyLabel}</p>
  }

  // Minimal kenglik ustunlar soniga qarab: kam ustunli jadval keraksiz aylanmasin,
  // ko'p ustunli jadvalda esa matn siqilib ketmasin.
  const minWidth = Math.min(1100, Math.max(560, columns.length * 112))

  return (
    <>
      {/* Desktop */}
      <div className={styles.tableWrap}>
        <table className={styles.table} style={{ minWidth }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width, textAlign: column.align ?? 'left' }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? styles.clickable : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil */}
      <div className={styles.cards}>
        {rows.map((row) => {
          const primary = columns.find((column) => column.primary)
          const rest = columns.filter((column) => !column.primary && !column.hideOnMobile)
          return (
            <div
              key={rowKey(row)}
              className={`${styles.card} ${onRowClick ? styles.clickable : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {primary && <div className={styles.cardPrimary}>{primary.render(row)}</div>}
              <dl className={styles.cardFields}>
                {rest.map((column) => (
                  <div key={column.key} className={styles.cardField}>
                    <dt>{column.header}</dt>
                    <dd>{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number
  pages: number
  total: number
  onChange: (page: number) => void
}) {
  if (pages <= 1) {
    return total > 0 ? <p className={styles.pageInfo}>Jami: {total} ta</p> : null
  }

  return (
    <div className={styles.pagination}>
      <p className={styles.pageInfo}>
        Jami <strong>{total}</strong> ta · {page}/{pages}-sahifa
      </p>
      <div className={styles.pageButtons}>
        <Button size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          ← Oldingi
        </Button>
        <Button size="sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>
          Keyingi →
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Qidiruv (debounce bilan)                                            */
/* ------------------------------------------------------------------ */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Qidirish…',
  delay = 350,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  delay?: number
}) {
  const [draft, setDraft] = useState(value)

  // Tashqaridan tozalansa (masalan, filtr reset) ichki holat ham yangilanadi
  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => onChange(draft), delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delay])

  return (
    <div className={styles.search}>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        prefix={<span aria-hidden="true">🔍</span>}
        type="search"
      />
      {draft && (
        <button
          type="button"
          className={styles.searchClear}
          onClick={() => {
            setDraft('')
            onChange('')
          }}
          aria-label="Tozalash"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tabs / segmentlangan boshqaruv                                      */
/* ------------------------------------------------------------------ */

export interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  scrollable = false,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  scrollable?: boolean
}) {
  return (
    <div className={`${styles.tabs} ${scrollable ? styles.tabsScroll : ''}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`${styles.tab} ${item.value === value ? styles.tabActive : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span className={styles.tabCount}>{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sahifa sarlavhasi                                                   */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.pageHeaderAction}>{action}</div>}
    </header>
  )
}

/** Filtrlar paneli */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>
}
