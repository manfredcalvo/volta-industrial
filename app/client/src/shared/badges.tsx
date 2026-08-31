/**
 * Small pill-style badges reused across the Operations page + home
 * activity feed. If you add a new status or action, update both the type
 * union in shared/types.ts and the colour map here.
 */
import type { LineStatus, MaintenanceAction } from './types';

const STATUS_LABEL: Record<LineStatus, string> = {
  healthy: 'healthy',
  at_risk: 'at risk',
  critical: 'critical',
};

export function StatusBadge({ status }: { status: LineStatus }) {
  const styles: Record<LineStatus, string> = {
    healthy:
      'bg-[var(--success-subtle)] text-[var(--success-subtle-foreground)]',
    at_risk:
      'bg-[var(--warning-subtle)] text-[var(--warning-subtle-foreground)]',
    critical: 'bg-destructive/15 text-destructive',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const ACTION_LABEL: Record<MaintenanceAction, string> = {
  pull_now: 'Pull now',
  run_to_shift_end: 'Run to shift end',
  expedite_parts_and_run: 'Expedite parts',
};

export function ActionBadge({ action }: { action: MaintenanceAction }) {
  const styles: Record<MaintenanceAction, string> = {
    pull_now: 'bg-destructive/15 text-destructive',
    run_to_shift_end: 'bg-muted text-foreground',
    expedite_parts_and_run:
      'bg-[var(--warning-subtle)] text-[var(--warning-subtle-foreground)]',
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${styles[action]}`}
    >
      {ACTION_LABEL[action]}
    </span>
  );
}

/** Human label for a maintenance action, reused in prose contexts. */
export function actionLabel(action: MaintenanceAction): string {
  return ACTION_LABEL[action];
}
