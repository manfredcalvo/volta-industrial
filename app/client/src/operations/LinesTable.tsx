/**
 * The line queue — a filterable, searchable table of production lines
 * ordered worst-exposure-first. Click a row to open the LineDrawer.
 * Status filter chips + a free-text search over line / plant / part.
 */
import { Search } from 'lucide-react';
import { StatusBadge, ActionBadge } from '@/shared/badges';
import type { LineRow, LineStatus } from '@/shared/types';

const STATUS_TABS: Array<{ key: LineStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'healthy', label: 'Healthy' },
];

const usd0 = (n: number) =>
  '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

type Props = {
  rows: LineRow[];
  loading: boolean;
  error: string | null;
  statusFilter: LineStatus | 'all';
  onStatusFilter: (s: LineStatus | 'all') => void;
  search: string;
  onSearch: (s: string) => void;
  onSelect: (id: string) => void;
};

export function LinesTable({
  rows,
  loading,
  error,
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  onSelect,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Filter bar */}
      <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onStatusFilter(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search line, plant, part…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {error ? (
        <div className="px-4 py-6 text-sm text-destructive">
          Couldn't load lines: {error}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground text-center">
          Loading lines…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground text-center">
          No lines match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left font-medium px-4 py-2">Line</th>
                <th className="text-left font-medium px-3 py-2">Plant</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Risk</th>
                <th className="text-right font-medium px-3 py-2">Exposure</th>
                <th className="text-left font-medium px-3 py-2">Recommended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.lineId)}
                  className="hover:bg-muted/40 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">
                      {r.lineName}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {r.lineId}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.plantName ?? r.plantId}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.currentStatus} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {(r.failureRiskScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {r.downtimeExposureUsd > 0 ? usd0(r.downtimeExposureUsd) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.recommendedAction ? (
                      <ActionBadge action={r.recommendedAction} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
