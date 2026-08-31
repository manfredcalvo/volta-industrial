/**
 * Types that cross the client/server boundary. Keep in sync with
 * server/db/queries/operations.ts + server/db/queries/chat.ts.
 *
 * The app is small enough that hand-copying these is simpler than a
 * shared package.
 *
 * Domain: Volta Industrial plant floor. The primary entity is a
 * production LINE and its failure risk / downtime exposure. The agent
 * investigates the worst line, ranks maintenance actions, and (on
 * approval) writes a work order. Analytics reads the richer warehouse
 * gold tables; the Operations queue reads the low-latency Lakebase
 * `app.*` mirror.
 */

/** Line health band, mirrored from app.line_status.current_status. */
export type LineStatus = 'healthy' | 'at_risk' | 'critical';

/** The three maintenance actions the heuristic/model ranks. */
export type MaintenanceAction =
  | 'pull_now'
  | 'run_to_shift_end'
  | 'expedite_parts_and_run';

export type WorkOrderStatus = 'drafted' | 'approved' | 'rejected';

/** One row in the Operations line queue (app.line_status + at-risk +
 *  recommendation context). Sorted by downtime exposure, worst first. */
export type LineRow = {
  id: string;
  lineId: string;
  plantId: string;
  lineName: string;
  plantName: string | null;
  region: string | null;
  failureRiskScore: number;
  downtimeExposureUsd: number;
  currentStatus: LineStatus;
  /** From app.open_atrisk — null when the line has no open at-risk row. */
  partLocal: boolean | null;
  candidatePartId: string | null;
  partLeadTimeDays: number | null;
  /** From app.maintenance_recommendations — null when unscored. */
  recommendedAction: MaintenanceAction | null;
  lastCheckAt: string | null;
};

/** KPI rollup by health band (from /api/lines/summary). */
export type StatusSummary = {
  status: LineStatus;
  n: number;
  total_exposure_usd: string;
};

/** One ranked maintenance option (parsed from the raw gold action_ranking). */
export type RankedAction = {
  action: string;
  costUsd: number;
  predictedCostAvoided: number;
  netValue: number;
};

/** A work order the agent drafted/approved against app.work_orders_app. */
export type WorkOrderEntry = {
  id: string;
  actionType: MaintenanceAction;
  partId: string | null;
  draftedWo: string;
  predictedDowntimeCostAvoidsUsd: number | null;
  status: WorkOrderStatus;
  approvedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** Full detail for the line drawer (/api/lines/:id). */
export type LineDetail = {
  lineId: string;
  plantId: string;
  lineName: string;
  plantName: string | null;
  region: string | null;
  failureRiskScore: number;
  downtimeExposureUsd: number;
  currentStatus: LineStatus;
  lastCheckAt: string | null;
  partLocal: boolean | null;
  candidatePartId: string | null;
  partLeadTimeDays: number | null;
  recommendedAction: MaintenanceAction | null;
  predictedDowntimeCostUsd: number | null;
  actionRanking: RankedAction[];
  workOrders: WorkOrderEntry[];
};

/** Per-plant rollup (/api/plants/summary). */
export type PlantRow = {
  plantId: string;
  plantName: string | null;
  region: string | null;
  lineCount: number;
  atRiskCount: number;
  criticalCount: number;
  totalExposureUsd: string;
};

/** Recent activity — work orders the agent drafted/approved
 *  (/api/activity/recent). */
export type ActivityEvent = {
  kind: 'work_order';
  lineId: string;
  workOrderId: string;
  at: string;
  by: string | null;
  action: string;
  actionType: MaintenanceAction;
  notes: string | null;
  tool: string | null;
};
