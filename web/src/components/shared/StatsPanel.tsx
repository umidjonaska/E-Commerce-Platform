import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UseQueryResult } from '@tanstack/react-query'
import { Card, CardHeader, StatTile } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import { Tabs, type TabItem } from '@/components/ui/data'
import { isoDate, money, number } from '@/lib/format'
import type { Stats, StatsPeriod } from '@/lib/types'
import styles from './StatsPanel.module.css'

const PERIOD_TABS: TabItem<StatsPeriod>[] = [
  { value: 'today', label: 'Bugun' },
  { value: 'week', label: 'Shu hafta' },
  { value: 'month', label: 'Shu oy' },
  { value: 'custom', label: 'Oraliq' },
]

export interface PeriodState {
  period: StatsPeriod
  dateFrom: string
  dateTo: string
}

export function usePeriod(initial: StatsPeriod = 'today') {
  const today = isoDate(new Date())
  const monthAgo = isoDate(new Date(Date.now() - 29 * 86400_000))
  const [state, setState] = useState<PeriodState>({
    period: initial,
    dateFrom: monthAgo,
    dateTo: today,
  })
  return [state, setState] as const
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState
  onChange: (next: PeriodState) => void
}) {
  return (
    <div className={styles.periodRow}>
      <Tabs
        items={PERIOD_TABS}
        value={value.period}
        onChange={(period) => onChange({ ...value, period })}
        scrollable
      />

      {value.period === 'custom' && (
        <div className={styles.dates}>
          <Field label="Dan">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={value.dateFrom}
                max={value.dateTo}
                onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
              />
            )}
          </Field>
          <Field label="Gacha">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={value.dateTo}
                min={value.dateFrom}
                max={isoDate(new Date())}
                onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    </div>
  )
}

function shortDate(value: string): string {
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : value
}

export function StatsPanel({
  query,
  showDillers = false,
}: {
  query: UseQueryResult<Stats>
  showDillers?: boolean
}) {
  const loading = query.isPending
  const stats = query.data

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  const totals = stats?.totals
  const series = (stats?.series ?? []).map((point) => ({
    ...point,
    label: shortDate(point.date),
  }))
  const hasSales = series.some((point) => point.sales > 0)

  return (
    <div className={styles.panel}>
      <div className={styles.tiles}>
        <StatTile
          label="Buyurtmalar"
          value={number(totals?.orders_count ?? 0)}
          hint="Davrda berilgan"
          loading={loading}
        />
        <StatTile
          label="Yetkazilgan"
          value={number(totals?.delivered_count ?? 0)}
          tone="success"
          hint="Davrda yopilgan"
          loading={loading}
        />
        <StatTile
          label="Savdo"
          value={money(totals?.sales_amount ?? 0)}
          tone="brand"
          hint="Yetkazilganlar bo‘yicha"
          loading={loading}
        />
        <StatTile
          label="O‘rtacha chek"
          value={money(totals?.average_order ?? 0)}
          loading={loading}
        />
        <StatTile
          label="Kutilmoqda"
          value={number(totals?.pending_now ?? 0)}
          tone="warning"
          hint="Hozirgi holat"
          loading={loading}
        />
        <StatTile
          label="Yo‘lda"
          value={number(totals?.confirmed_now ?? 0)}
          tone="info"
          hint="Qabul qilingan"
          loading={loading}
        />
        <StatTile
          label="Bekor qilingan"
          value={number(totals?.cancelled_count ?? 0)}
          tone="danger"
          hint="Davrda"
          loading={loading}
        />
        <StatTile label="Mijozlar" value={number(totals?.clients_count ?? 0)} loading={loading} />
      </div>

      {/* ---------- Grafik ---------- */}
      <Card>
        <CardHeader title="Savdo dinamikasi" subtitle="Yetkazib berilgan buyurtmalar summasi" />
        {loading ? (
          <div className={styles.chartSkeleton} aria-hidden="true" />
        ) : !hasSales ? (
          <EmptyState
            icon="📈"
            title="Bu davrda savdo bo‘lmagan"
            description="Buyurtmalar yetkazib berilgach, grafik shu yerda ko‘rinadi."
          />
        ) : (
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--c-brand)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--c-brand)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--c-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--c-border)' }}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value: number) =>
                    value >= 1_000_000
                      ? `${(value / 1_000_000).toFixed(1)}M`
                      : value >= 1000
                        ? `${Math.round(value / 1000)}k`
                        : String(value)
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 'var(--r-md)',
                    fontSize: 13,
                    color: 'var(--c-text)',
                  }}
                  labelStyle={{ color: 'var(--c-text-muted)' }}
                  formatter={(value: number) => [money(value), 'Savdo']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--c-brand)"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ---------- Top mahsulotlar ---------- */}
      <div className={styles.twoCol}>
        <Card>
          <CardHeader title="Eng ko‘p sotilgan mahsulotlar" />
          {loading ? (
            <div className={styles.listSkeleton} aria-hidden="true" />
          ) : (stats?.top_products.length ?? 0) === 0 ? (
            <EmptyState icon="🏆" title="Ma’lumot yo‘q" description="Bu davrda sotuv bo‘lmagan." />
          ) : (
            <ol className={styles.rank}>
              {stats?.top_products.map((product, index) => (
                <li key={product.name} className={styles.rankItem}>
                  <span className={styles.rankNum}>{index + 1}</span>
                  <span className={styles.rankName}>{product.name}</span>
                  <span className={styles.rankMeta}>{number(product.quantity)} dona</span>
                  <span className={styles.rankValue}>{money(product.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {showDillers && (
          <Card>
            <CardHeader title="Eng faol dillerlar" />
            {loading ? (
              <div className={styles.listSkeleton} aria-hidden="true" />
            ) : (stats?.top_dillers?.length ?? 0) === 0 ? (
              <EmptyState
                icon="🚚"
                title="Ma’lumot yo‘q"
                description="Bu davrda yetkazib berilgan buyurtma yo‘q."
              />
            ) : (
              <ol className={styles.rank}>
                {stats?.top_dillers?.map((diller, index) => (
                  <li key={diller.diller_id} className={styles.rankItem}>
                    <span className={styles.rankNum}>{index + 1}</span>
                    <span className={styles.rankName}>{diller.name}</span>
                    <span className={styles.rankMeta}>{number(diller.delivered_count)} ta</span>
                    <span className={styles.rankValue}>{money(diller.sales_amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
