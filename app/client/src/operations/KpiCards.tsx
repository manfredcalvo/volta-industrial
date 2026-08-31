/**
 * Three KPI cards at the top of the Operations page: healthy / at-risk /
 * critical line counts + total downtime exposure $. When the agent's write
 * fires `dataMutated`, each card's `count` is compared to the previous
 * value and only the cards that *moved* pulse a ring (usePulseOnChange).
 */
import { AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { usePulseOnChange } from '@/lib/usePulseOnChange';
import type { LineStatus, StatusSummary } from '@/shared/types';

export function KpiCards({ summary }: { summary: StatusSummary[] }) {
  const byStatus = new Map<LineStatus, StatusSummary>();
  for (const s of summary) byStatus.set(s.status, s);
  const healthy = byStatus.get('healthy');
  const atRisk = byStatus.get('at_risk');
  const critical = byStatus.get('critical');
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <Card
        label="Healthy"
        count={healthy?.n ?? 0}
        value={healthy?.total_exposure_usd ?? '0'}
        icon={<CheckCircle2 className="size-4" />}
        tone="success"
      />
      <Card
        label="At risk"
        count={atRisk?.n ?? 0}
        value={atRisk?.total_exposure_usd ?? '0'}
        icon={<Activity className="size-4" />}
        tone="neutral"
      />
      <Card
        label="Critical"
        count={critical?.n ?? 0}
        value={critical?.total_exposure_usd ?? '0'}
        icon={<AlertTriangle className="size-4" />}
        tone="danger"
      />
    </div>
  );
}

function Card({
  label,
  count,
  value,
  icon,
  tone,
}: {
  label: string;
  count: number;
  value: string;
  icon: React.ReactNode;
  tone: 'neutral' | 'success' | 'danger';
}) {
  const pulse = usePulseOnChange(count);
  const toneClass =
    tone === 'success'
      ? 'text-[var(--success-subtle-foreground)]'
      : tone === 'danger'
        ? 'text-destructive'
        : 'text-foreground';
  const valueNum = Number(value);
  const compactDollar = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(valueNum);
  const fullDollar = valueNum.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  return (
    <div
      className={`rounded-xl border border-border bg-card p-3 sm:p-5 transition-shadow ${
        pulse ? 'animate-pulse-ring' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.15em] text-muted-foreground">
        <span className={toneClass}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 sm:mt-2 flex flex-col sm:flex-row sm:items-baseline gap-0 sm:gap-2">
        <div className="display text-2xl sm:text-3xl font-semibold text-foreground">
          {count.toLocaleString()}
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground">
          <span className="sm:hidden">${compactDollar}</span>
          <span className="hidden sm:inline">· ${fullDollar} exposure</span>
        </div>
      </div>
    </div>
  );
}
