/**
 * The Operations page — the WRITE SURFACE for the plant floor.
 *
 * Renders the production-line queue from Lakebase (live, writable,
 * transactional) and stays in sync with the agent's actions via the
 * `dataMutated` pub/sub: when the chat stream completes, the queue
 * refetches — so you literally WATCH the agent's work orders land here.
 *
 * Orchestration only: owns filter/selection/search state, fetches data,
 * subscribes to `dataMutated`. Sub-components render the pieces:
 *    KpiCards    — healthy / at-risk / critical + exposure at a glance
 *    PlantMap    — geographic exposure bubbles (warehouse-backed)
 *    LinesTable  — filterable queue, click a row to open the drawer
 *    LineDrawer  — slide-over with risk, ranked actions, work orders
 */
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { fetchLines, fetchLineSummary } from '@/lib/lines';
import { useSession } from '@/lib/api';
import { dataMutated } from '@/lib/events';
import { dockController } from '@/chat/dockController';
import type { LineRow, LineStatus, StatusSummary } from '@/shared/types';

import { PlantMap } from './PlantMap';
import { KpiCards } from './KpiCards';
import { LinesTable } from './LinesTable';
import { LineDrawer } from './LineDrawer';
import { IngestionFlow } from '@/architecture/IngestionFlow';

export function OperationsView() {
  const [filter, setFilter] = useState<LineStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LineRow[]>([]);
  const [summary, setSummary] = useState<StatusSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { config } = useSession();

  async function reload() {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        fetchLines(),
        fetchLineSummary(),
      ]);
      setRows(list);
      setSummary(sum);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    return dataMutated.subscribe(() => {
      void reload();
    });
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.currentStatus !== filter) return false;
      if (!q) return true;
      return (
        r.lineName.toLowerCase().includes(q) ||
        r.lineId.toLowerCase().includes(q) ||
        (r.plantName ?? r.plantId).toLowerCase().includes(q) ||
        (r.candidatePartId ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 lg:items-end">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Plant floor — line queue
              </div>
              <h1 className="display text-4xl font-semibold tracking-tight text-foreground mb-2">
                Work the at-risk lines.
              </h1>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Each line carries a failure-risk score and the downtime it puts at
              risk. Investigate the worst offenders, weigh the ranked actions,
              and approve a work order — pull the line, run to shift end, or
              expedite the part.
            </p>
            {config?.assistantScript?.[0] && (
              <button
                onClick={() =>
                  dockController.openAndSend(config.assistantScript[0].prompt)
                }
                className="w-full text-left rounded-xl border border-border bg-card hover:border-foreground/30 hover:shadow-sm px-5 py-4 transition-all flex items-center gap-4 group"
              >
                <div
                  className="size-10 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                  }}
                >
                  <Sparkles className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    A line is trending down
                  </div>
                  <div className="text-sm font-medium text-foreground mt-0.5">
                    Ask the assistant what's driving the risk
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </button>
            )}
          </div>
          <IngestionFlow />
        </div>

        <KpiCards summary={summary} />

        <PlantMap />

        <LinesTable
          rows={filteredRows}
          loading={loading}
          error={error}
          statusFilter={filter}
          onStatusFilter={setFilter}
          search={search}
          onSearch={setSearch}
          onSelect={setSelectedId}
        />
      </div>

      <LineDrawer
        id={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
