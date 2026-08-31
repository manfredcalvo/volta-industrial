/**
 * Read helpers for the Operations surface (line queue, detail drawer,
 * plant rollups, activity feed). All read the low-latency Lakebase
 * `app.*` mirror populated by db/sync.ts; the write-surface
 * (work_orders_app) is the app-owned table the agent appends to.
 *
 * These back the REST endpoints in server/routes/lines.ts. Analytics
 * (richer warehouse dims) goes through server/routes/charts.ts instead.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../index.js';
import {
  lineStatus,
  openAtrisk,
  maintenanceRecommendations,
  workOrdersApp,
} from '../schema.js';

// Server-owned response shapes. The client mirrors these in
// client/src/shared/types.ts (hand-kept in sync — the server tsconfig
// excludes client/, so we can't share the file directly).
type LineStatusBand = 'healthy' | 'at_risk' | 'critical';
type MaintenanceAction =
  | 'pull_now'
  | 'run_to_shift_end'
  | 'expedite_parts_and_run';
type WorkOrderStatus = 'drafted' | 'approved' | 'rejected';

export type LineRow = {
  id: string;
  lineId: string;
  plantId: string;
  lineName: string;
  plantName: string | null;
  region: string | null;
  failureRiskScore: number;
  downtimeExposureUsd: number;
  currentStatus: LineStatusBand;
  partLocal: boolean | null;
  candidatePartId: string | null;
  partLeadTimeDays: number | null;
  recommendedAction: MaintenanceAction | null;
  lastCheckAt: string | null;
};

export type StatusSummary = {
  status: LineStatusBand;
  n: number;
  total_exposure_usd: string;
};

export type RankedAction = {
  action: string;
  costUsd: number;
  predictedCostAvoided: number;
  netValue: number;
};

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

export type LineDetail = {
  lineId: string;
  plantId: string;
  lineName: string;
  plantName: string | null;
  region: string | null;
  failureRiskScore: number;
  downtimeExposureUsd: number;
  currentStatus: LineStatusBand;
  lastCheckAt: string | null;
  partLocal: boolean | null;
  candidatePartId: string | null;
  partLeadTimeDays: number | null;
  recommendedAction: MaintenanceAction | null;
  predictedDowntimeCostUsd: number | null;
  actionRanking: RankedAction[];
  workOrders: WorkOrderEntry[];
};

export type PlantRow = {
  plantId: string;
  plantName: string | null;
  region: string | null;
  lineCount: number;
  atRiskCount: number;
  criticalCount: number;
  totalExposureUsd: string;
};

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

// action_ranking is stored as the raw gold JSON (snake_case keys). Parse
// defensively — identical to server/db/queries/maintenance.ts.
const rankItemSchema = z.object({
  action: z.string(),
  predicted_downtime_cost_avoided_usd: z.number().nullish(),
  action_cost_usd: z.number().nullish(),
  net: z.number().nullish(),
});

function parseRanking(raw: unknown): RankedAction[] {
  const parsed = z.array(rankItemSchema).safeParse(raw);
  return (parsed.success ? parsed.data : []).map((it) => ({
    action: it.action,
    costUsd: it.action_cost_usd ?? 0,
    predictedCostAvoided: it.predicted_downtime_cost_avoided_usd ?? 0,
    netValue: it.net ?? 0,
  }));
}

/** The full line queue, worst downtime exposure first. */
export async function listLines(db: AppDb): Promise<LineRow[]> {
  const rows = await db
    .select({
      id: lineStatus.id,
      lineId: lineStatus.lineId,
      plantId: lineStatus.plantId,
      lineName: lineStatus.lineName,
      plantName: lineStatus.plantName,
      region: lineStatus.region,
      failureRiskScore: lineStatus.failureRiskScore,
      downtimeExposureUsd: lineStatus.downtimeExposureUsd,
      currentStatus: lineStatus.currentStatus,
      partLocal: openAtrisk.partLocal,
      candidatePartId: openAtrisk.candidatePartId,
      partLeadTimeDays: openAtrisk.partLeadTimeDays,
      recommendedAction: maintenanceRecommendations.recommendedAction,
      lastCheckAt: lineStatus.lastCheckAt,
    })
    .from(lineStatus)
    .leftJoin(openAtrisk, eq(openAtrisk.lineId, lineStatus.lineId))
    .leftJoin(
      maintenanceRecommendations,
      eq(maintenanceRecommendations.lineId, lineStatus.lineId),
    )
    .orderBy(desc(lineStatus.downtimeExposureUsd));

  return rows.map((r) => ({
    ...r,
    lastCheckAt: r.lastCheckAt ? r.lastCheckAt.toISOString() : null,
  }));
}

/** Line counts + total exposure grouped by health band. */
export async function lineSummary(db: AppDb): Promise<StatusSummary[]> {
  const rows = await db
    .select({
      status: lineStatus.currentStatus,
      n: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${lineStatus.downtimeExposureUsd}), 0)::text`,
    })
    .from(lineStatus)
    .groupBy(lineStatus.currentStatus);

  return rows.map((r) => ({
    status: r.status,
    n: r.n,
    total_exposure_usd: r.total,
  }));
}

/** Full detail for one line, incl. its work-order history. */
export async function lineDetail(
  db: AppDb,
  lineId: string,
): Promise<LineDetail | null> {
  const base = await db
    .select({
      lineId: lineStatus.lineId,
      plantId: lineStatus.plantId,
      lineName: lineStatus.lineName,
      plantName: lineStatus.plantName,
      region: lineStatus.region,
      failureRiskScore: lineStatus.failureRiskScore,
      downtimeExposureUsd: lineStatus.downtimeExposureUsd,
      currentStatus: lineStatus.currentStatus,
      lastCheckAt: lineStatus.lastCheckAt,
      partLocal: openAtrisk.partLocal,
      candidatePartId: openAtrisk.candidatePartId,
      partLeadTimeDays: openAtrisk.partLeadTimeDays,
    })
    .from(lineStatus)
    .leftJoin(openAtrisk, eq(openAtrisk.lineId, lineStatus.lineId))
    .where(eq(lineStatus.lineId, lineId))
    .limit(1);

  const b = base[0];
  if (!b) return null;

  const recRows = await db
    .select()
    .from(maintenanceRecommendations)
    .where(eq(maintenanceRecommendations.lineId, lineId))
    .limit(1);
  const rec = recRows[0];

  const woRows = await db
    .select()
    .from(workOrdersApp)
    .where(eq(workOrdersApp.lineId, lineId))
    .orderBy(desc(workOrdersApp.createdAt));

  const workOrders: WorkOrderEntry[] = woRows.map((w) => ({
    id: w.id,
    actionType: w.actionType,
    partId: w.partId,
    draftedWo: w.draftedWo,
    predictedDowntimeCostAvoidsUsd: w.predictedDowntimeCostAvoidsUsd,
    status: w.status,
    approvedBy: w.approvedBy,
    createdAt: w.createdAt.toISOString(),
    decidedAt: w.decidedAt ? w.decidedAt.toISOString() : null,
  }));

  return {
    lineId: b.lineId,
    plantId: b.plantId,
    lineName: b.lineName,
    plantName: b.plantName,
    region: b.region,
    failureRiskScore: b.failureRiskScore,
    downtimeExposureUsd: b.downtimeExposureUsd,
    currentStatus: b.currentStatus,
    lastCheckAt: b.lastCheckAt ? b.lastCheckAt.toISOString() : null,
    partLocal: b.partLocal,
    candidatePartId: b.candidatePartId,
    partLeadTimeDays: b.partLeadTimeDays,
    recommendedAction: rec?.recommendedAction ?? null,
    predictedDowntimeCostUsd: rec?.predictedDowntimeCostUsd ?? null,
    actionRanking: rec ? parseRanking(rec.actionRanking) : [],
    workOrders,
  };
}

/** Per-plant rollup: line count, at-risk/critical counts, exposure. */
export async function plantSummary(db: AppDb): Promise<PlantRow[]> {
  const rows = await db
    .select({
      plantId: lineStatus.plantId,
      plantName: lineStatus.plantName,
      region: lineStatus.region,
      lineCount: sql<number>`count(*)::int`,
      atRiskCount: sql<number>`count(*) filter (where ${lineStatus.currentStatus} = 'at_risk')::int`,
      criticalCount: sql<number>`count(*) filter (where ${lineStatus.currentStatus} = 'critical')::int`,
      totalExposureUsd: sql<string>`coalesce(sum(${lineStatus.downtimeExposureUsd}), 0)::text`,
    })
    .from(lineStatus)
    .groupBy(lineStatus.plantId, lineStatus.plantName, lineStatus.region)
    .orderBy(desc(sql`coalesce(sum(${lineStatus.downtimeExposureUsd}), 0)`));

  return rows.map((r) => ({
    plantId: r.plantId,
    plantName: r.plantName,
    region: r.region,
    lineCount: r.lineCount,
    atRiskCount: r.atRiskCount,
    criticalCount: r.criticalCount,
    totalExposureUsd: r.totalExposureUsd,
  }));
}

/** The most recent work orders (agent activity feed). */
export async function recentActivity(
  db: AppDb,
  limit = 20,
): Promise<ActivityEvent[]> {
  const rows = await db
    .select()
    .from(workOrdersApp)
    .orderBy(desc(workOrdersApp.createdAt))
    .limit(limit);

  return rows.map((w) => {
    // Last audit entry (if any) carries the richest notes/tool context.
    const lastAudit = w.auditTrail[w.auditTrail.length - 1];
    return {
      kind: 'work_order' as const,
      lineId: w.lineId,
      workOrderId: w.id,
      at: (w.decidedAt ?? w.createdAt).toISOString(),
      by: w.approvedBy ?? lastAudit?.by ?? null,
      action: w.status,
      actionType: w.actionType,
      notes: lastAudit?.notes ?? null,
      tool: lastAudit?.tool ?? null,
    };
  });
}
