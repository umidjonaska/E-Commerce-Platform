import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Toolbar } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { PeriodPicker, StatsPanel, usePeriod } from '@/components/shared/StatsPanel'

export default function AdminStatistics() {
  const [period, setPeriod] = usePeriod('month')
  const [dillerId, setDillerId] = useState('')

  const dillersQuery = useQuery({
    queryKey: ['admin', 'dillers', 'all-for-select'],
    queryFn: ({ signal }) => api.admin.dillers({ size: 100 }, signal),
  })

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats', period, dillerId],
    queryFn: ({ signal }) =>
      api.admin.stats(
        {
          period: period.period,
          date_from: period.period === 'custom' ? period.dateFrom : undefined,
          date_to: period.period === 'custom' ? period.dateTo : undefined,
          diller_id: dillerId ? Number(dillerId) : undefined,
        },
        signal,
      ),
  })

  return (
    <>
      <PageHeader title="Statistika" subtitle="Platforma bo‘yicha savdo ko‘rsatkichlari" />

      <Toolbar>
        <div style={{ minWidth: 220 }}>
          <Select
            value={dillerId}
            onChange={(event) => setDillerId(event.target.value)}
            aria-label="Diller bo‘yicha filtr"
          >
            <option value="">Barcha dillerlar</option>
            {(dillersQuery.data?.items ?? []).map((diller) => (
              <option key={diller.id} value={diller.id}>
                {diller.company_name || diller.full_name || diller.username}
              </option>
            ))}
          </Select>
        </div>
      </Toolbar>

      <PeriodPicker value={period} onChange={setPeriod} />
      <StatsPanel query={statsQuery} showDillers={!dillerId} />
    </>
  )
}
