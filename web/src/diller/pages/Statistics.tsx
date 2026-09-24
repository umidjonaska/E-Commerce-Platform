import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/data'
import { PeriodPicker, StatsPanel, usePeriod } from '@/components/shared/StatsPanel'

export default function DillerStatistics() {
  const [period, setPeriod] = usePeriod('month')

  const statsQuery = useQuery({
    queryKey: ['diller', 'stats', period],
    queryFn: ({ signal }) =>
      api.diller.stats(
        {
          period: period.period,
          date_from: period.period === 'custom' ? period.dateFrom : undefined,
          date_to: period.period === 'custom' ? period.dateTo : undefined,
        },
        signal,
      ),
  })

  return (
    <>
      <PageHeader title="Statistika" subtitle="Savdo va buyurtmalar ko‘rsatkichlari" />
      <PeriodPicker value={period} onChange={setPeriod} />
      <StatsPanel query={statsQuery} />
    </>
  )
}
