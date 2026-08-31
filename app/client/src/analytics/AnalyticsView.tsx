/**
 * Analytics — warehouse-backed charts.
 *
 * Live SQL-warehouse queries against the Delta lakehouse (not a mock).
 * Each chart fetches `/api/charts/<key>` (see server/routes/charts.ts),
 * which reads config/queries/<key>.sql and binds the demo catalog/schema
 * so one env var drives the analytics tables on any workspace. Rows come
 * back via `useChartData` and feed the chart components' `data` prop.
 *
 * Repurposing: edit/add a .sql under config/queries/, register its key in
 * charts.ts's QUERY_FILES map, and reference it here via <ChartData chartKey=…>.
 */
import { useEffect, useState } from 'react';
import { BarChart } from '@databricks/appkit-ui/react';
import { fetchWarehouse, type Warehouse } from '@/lib/api';
import { BRAND_PALETTE } from '@/lib/brand';
import { RtPitch } from '@/architecture/RtPitch';

function useChartData<T = Record<string, unknown>>(key: string): {
  data: T[] | null;
  error: string | null;
  isLoading: boolean;
} {
  const [state, setState] = useState<{
    data: T[] | null;
    error: string | null;
    isLoading: boolean;
  }>({ data: null, error: null, isLoading: true });

  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, isLoading: true });
    fetch(`/api/charts/${key}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body.data as T[];
      })
      .then((data) => alive && setState({ data, error: null, isLoading: false }))
      .catch(
        (e) =>
          alive &&
          setState({ data: null, error: String(e?.message ?? e), isLoading: false }),
      );
    return () => {
      alive = false;
    };
  }, [key]);

  return state;
}

export function AnalyticsView() {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);

  useEffect(() => {
    fetchWarehouse().then(setWarehouse).catch(console.error);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6 sm:space-y-10">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Plant-floor analytics
          </div>
          <h1 className="display text-4xl font-semibold tracking-tight text-foreground mb-2">
            Where the downtime risk is concentrated.
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Live queries against the SQL warehouse — the same numbers the
            assistant reasons about, on a single page. Use the queue to take
            action; use this page to spot patterns across plants and machine
            types.
          </p>
        </div>

        <RtPitch
          warehouse={
            warehouse?.name
              ? { name: warehouse.name, state: warehouse.state ?? null }
              : null
          }
          latencyMs={null}
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <ChartCard
            title="Worst lines by downtime exposure"
            scope="Top 15"
            className="lg:col-span-3"
          >
            <ChartData chartKey="worst_lines" height={260}>
              {(rows) => (
                <BarChart
                  data={rows}
                  xKey="line_name"
                  yKey="downtime_exposure_usd"
                  colors={[BRAND_PALETTE[0]]}
                  height={260}
                />
              )}
            </ChartData>
          </ChartCard>

          <ChartCard
            title="Exposure by machine type"
            scope="All lines"
            className="lg:col-span-2"
          >
            <ChartData chartKey="risk_by_machine_type" height={260}>
              {(rows) => (
                <BarChart
                  data={rows}
                  xKey="machine_type"
                  yKey="total_exposure_usd"
                  colors={[BRAND_PALETTE[1]]}
                  height={260}
                />
              )}
            </ChartData>
          </ChartCard>
        </div>

        <ChartCard title="Worst lines" scope="By downtime exposure" flush>
          <div className="hidden sm:block">
            <WorstLinesTable />
          </div>
          <div className="sm:hidden">
            <WorstLinesMobile />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  scope,
  className,
  flush,
  children,
}: {
  title: string;
  scope?: string;
  className?: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card overflow-hidden ${className ?? ''}`}
    >
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {scope && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {scope}
          </span>
        )}
      </div>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

function ChartData({
  chartKey,
  height,
  children,
}: {
  chartKey: string;
  height: number;
  children: (rows: Record<string, unknown>[]) => React.ReactNode;
}) {
  const { data, error, isLoading } = useChartData(chartKey);
  const center = `flex items-center justify-center text-sm`;
  if (error) {
    return (
      <div className={`${center} text-destructive`} style={{ height }}>
        Error loading chart: {error}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className={`${center} text-muted-foreground`} style={{ height }}>
        Loading…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className={`${center} text-muted-foreground`} style={{ height }}>
        No data.
      </div>
    );
  }
  return <>{children(data)}</>;
}

type WorstLineRow = {
  line_id: string;
  line_name: string | null;
  plant_id: string | null;
  machine_type: string | null;
  failure_risk_score: number;
  risk_band: string | null;
  downtime_exposure_usd: number;
};

function bandToneClass(band: string | null): string {
  if (band === 'critical') return 'text-[var(--severity-danger)]';
  if (band === 'elevated') return 'text-[var(--severity-warning)]';
  return 'text-foreground';
}

const compactUsd = (n: number) =>
  '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function useWorstLines():
  | { data: WorstLineRow[] }
  | { fallback: React.ReactNode } {
  const { data, error, isLoading } = useChartData<WorstLineRow>('worst_lines');
  if (error) {
    return {
      fallback: (
        <div className="px-4 py-3 text-sm text-destructive">
          Couldn't load lines: {error}
        </div>
      ),
    };
  }
  if (isLoading || !data) {
    return {
      fallback: (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">
          Loading…
        </div>
      ),
    };
  }
  if (data.length === 0) {
    return {
      fallback: (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">
          No lines returned data.
        </div>
      ),
    };
  }
  return { data };
}

function WorstLinesMobile() {
  const r = useWorstLines();
  if ('fallback' in r) return r.fallback;
  return (
    <ul className="divide-y divide-border">
      {r.data.map((row) => (
        <li key={row.line_id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-muted-foreground">
                {row.line_id}
              </div>
              <div className="text-sm font-medium truncate mt-0.5">
                {row.line_name ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {[row.plant_id, row.machine_type].filter(Boolean).join(' · ') ||
                  '—'}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`display text-xl font-semibold ${bandToneClass(row.risk_band)}`}
              >
                {(row.failure_risk_score * 100).toFixed(0)}%
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                failure risk
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{row.risk_band ?? '—'}</span>
            <span className="font-mono text-foreground">
              {compactUsd(row.downtime_exposure_usd)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WorstLinesTable() {
  const r = useWorstLines();
  if ('fallback' in r) return r.fallback;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="text-left font-medium px-3 py-2">Line</th>
            <th className="text-left font-medium px-3 py-2">Plant</th>
            <th className="text-left font-medium px-3 py-2">Machine</th>
            <th className="text-left font-medium px-3 py-2">Band</th>
            <th className="text-right font-medium px-3 py-2">Risk</th>
            <th className="text-right font-medium px-3 py-2">Exposure</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {r.data.map((row) => (
            <tr key={row.line_id} className="hover:bg-muted/40">
              <td className="px-3 py-2">
                <span className="font-medium">{row.line_name ?? '—'}</span>
                <span className="font-mono text-[11px] text-muted-foreground ml-2">
                  {row.line_id}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.plant_id ?? '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.machine_type ?? '—'}
              </td>
              <td className={`px-3 py-2 ${bandToneClass(row.risk_band)}`}>
                {row.risk_band ?? '—'}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${bandToneClass(row.risk_band)}`}
              >
                {(row.failure_risk_score * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {compactUsd(row.downtime_exposure_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
