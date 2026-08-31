/**
 * Right-side drawer opened when the user clicks a line in the queue.
 * Shows the full line detail: health + risk + exposure, the ranked
 * maintenance actions (the model/heuristic output the agent reasons
 * over), part context, and the work-order history the agent writes.
 * Auto-refreshes on `dataMutated` so the agent's writes land live.
 */
import { useEffect, useState } from 'react';
import { Factory, Wrench, Package } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@databricks/appkit-ui/react';
import { fetchLine } from '@/lib/lines';
import { dataMutated } from '@/lib/events';
import { StatusBadge, ActionBadge, actionLabel } from '@/shared/badges';
import type { LineDetail, MaintenanceAction } from '@/shared/types';

const usd0 = (n: number) =>
  '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

type Props = {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LineDrawer({ id, open, onOpenChange }: Props) {
  const [detail, setDetail] = useState<LineDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetchLine(id)
      .then(setDetail)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    const unsub = dataMutated.subscribe(() => {
      if (id) void fetchLine(id).then(setDetail).catch(() => {});
    });
    return unsub;
  }, [id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full sm:!w-[60vw] sm:!max-w-[60vw] lg:!w-[640px] lg:!max-w-[640px] p-0 flex flex-col"
      >
        {!detail && loading && (
          <div className="p-8 text-muted-foreground">Loading…</div>
        )}
        {error && <div className="p-8 text-destructive">{error}</div>}
        {detail && (
          <>
            <SheetHeader className="px-8 pt-8 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <StatusBadge status={detail.currentStatus} />
                <span className="font-mono text-xs text-muted-foreground">
                  {detail.lineId}
                </span>
                <span className="font-mono text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Factory className="size-3" />{' '}
                  {detail.plantName ?? detail.plantId}
                </span>
              </div>
              <SheetTitle className="display text-2xl">
                {detail.lineName}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <span>
                  Failure risk{' '}
                  <span className="font-semibold text-foreground">
                    {(detail.failureRiskScore * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span>
                  Downtime exposure{' '}
                  <span className="font-semibold text-foreground">
                    {detail.downtimeExposureUsd > 0
                      ? usd0(detail.downtimeExposureUsd)
                      : '—'}
                  </span>
                </span>
                {detail.region && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {detail.region}
                    </span>
                  </>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
              {/* Recommended action */}
              <section>
                <SectionLabel icon={<Wrench className="size-3.5" />}>
                  Recommended action
                </SectionLabel>
                {detail.recommendedAction ? (
                  <div className="mt-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <ActionBadge action={detail.recommendedAction} />
                      {detail.predictedDowntimeCostUsd != null && (
                        <span className="text-sm text-muted-foreground">
                          avoids ~{usd0(detail.predictedDowntimeCostUsd)} downtime
                        </span>
                      )}
                    </div>
                    {detail.actionRanking.length > 0 && (
                      <RankedActions
                        rows={detail.actionRanking}
                        recommended={detail.recommendedAction}
                      />
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No recommendation scored for this line — it isn't currently
                    at risk.
                  </p>
                )}
              </section>

              {/* Part context */}
              {detail.candidatePartId && (
                <section>
                  <SectionLabel icon={<Package className="size-3.5" />}>
                    Part
                  </SectionLabel>
                  <div className="mt-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono text-xs">
                      {detail.candidatePartId}
                    </span>
                    <span
                      className={
                        detail.partLocal
                          ? 'text-[var(--success-subtle-foreground)]'
                          : 'text-[var(--warning-subtle-foreground)]'
                      }
                    >
                      {detail.partLocal ? 'In local stock' : 'Not local'}
                    </span>
                    {detail.partLeadTimeDays != null && (
                      <span className="text-muted-foreground">
                        {detail.partLeadTimeDays}d lead time
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* Work-order history */}
              <section>
                <SectionLabel>
                  Work orders ({detail.workOrders.length})
                </SectionLabel>
                {detail.workOrders.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No work orders yet. When you approve an action in chat, it
                    lands here.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {detail.workOrders.map((w) => (
                      <li key={w.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <ActionBadge action={w.actionType} />
                          <span className="text-xs text-muted-foreground">
                            {w.status}
                            {' · '}
                            {new Date(w.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm mt-1.5 whitespace-pre-wrap">
                          {w.draftedWo}
                        </div>
                        {w.approvedBy && (
                          <div className="text-xs text-muted-foreground mt-1">
                            by {w.approvedBy}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

function RankedActions({
  rows,
  recommended,
}: {
  rows: { action: string; costUsd: number; predictedCostAvoided: number; netValue: number }[];
  recommended: MaintenanceAction;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="text-left font-medium px-3 py-2">Action</th>
            <th className="text-right font-medium px-3 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Avoided</th>
            <th className="text-right font-medium px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const isRec = r.action === recommended;
            return (
              <tr key={r.action} className={isRec ? 'bg-primary/5' : ''}>
                <td className="px-3 py-2">
                  {isRec ? (
                    <ActionBadge action={recommended} />
                  ) : (
                    <span className="text-xs">
                      {actionLabelSafe(r.action)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {usd0(r.costUsd)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {usd0(r.predictedCostAvoided)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono font-semibold ${
                    r.netValue >= 0
                      ? 'text-[var(--success-subtle-foreground)]'
                      : 'text-destructive'
                  }`}
                >
                  {usd0(r.netValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// action strings in the ranking are the raw enum values; label them
// gracefully even if an unexpected value slips through.
function actionLabelSafe(action: string): string {
  const known: MaintenanceAction[] = [
    'pull_now',
    'run_to_shift_end',
    'expedite_parts_and_run',
  ];
  return (known as string[]).includes(action)
    ? actionLabel(action as MaintenanceAction)
    : action;
}
