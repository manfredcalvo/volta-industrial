/**
 * Query helpers for maintenance/plant-floor operations (Build 2/3).
 *
 * Read helpers hit the READ-ONLY synced mirrors (app.open_atrisk, app.line_status,
 * app.maintenance_recommendations, app.parts). The write helper inserts into the
 * app-owned app.work_orders_app inside a transaction. All are consumed by the
 * agent tools in server/agent/plantfloor.ts.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../index.js';
import {
  openAtrisk,
  lineStatus,
  maintenanceRecommendations,
  workOrdersApp,
  type MaintenanceAuditEntry,
} from '../schema.js';

/** The worst at-risk line by downtime exposure (app.open_atrisk). */
export async function worstAtriskLine(
  db: AppDb,
): Promise<{
  lineId: string;
  plantId: string;
  lineName: string;
  failureRiskScore: number;
  downtimeExposureUsd: number;
} | null> {
  const rows = await db
    .select({
      lineId: openAtrisk.lineId,
      plantId: openAtrisk.plantId,
      lineName: openAtrisk.lineName,
      failureRiskScore: openAtrisk.failureRiskScore,
      downtimeExposureUsd: openAtrisk.downtimeExposureUsd,
    })
    .from(openAtrisk)
    .orderBy(desc(openAtrisk.downtimeExposureUsd))
    .limit(1);
  return rows[0] ?? null;
}

/** Line status (app.line_status) + parts context (app.open_atrisk) for a line. */
export async function getLineStatus(
  db: AppDb,
  lineId: string,
): Promise<{
  lineId: string;
  plantId: string;
  lineName: string;
  failureRiskScore: number;
  downtimeExposureUsd: number;
  currentStatus: 'healthy' | 'at_risk' | 'critical';
  partLocal: boolean;
  partId: string | null;
  partLeadTimeDays: number;
} | null> {
  const rows = await db
    .select({
      lineId: lineStatus.lineId,
      plantId: lineStatus.plantId,
      lineName: lineStatus.lineName,
      failureRiskScore: lineStatus.failureRiskScore,
      downtimeExposureUsd: lineStatus.downtimeExposureUsd,
      currentStatus: lineStatus.currentStatus,
      partLocal: openAtrisk.partLocal,
      partId: openAtrisk.candidatePartId,
      partLeadTimeDays: openAtrisk.partLeadTimeDays,
    })
    .from(lineStatus)
    .leftJoin(openAtrisk, eq(openAtrisk.lineId, lineStatus.lineId))
    .where(eq(lineStatus.lineId, lineId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    lineId: r.lineId,
    plantId: r.plantId,
    lineName: r.lineName,
    failureRiskScore: r.failureRiskScore,
    downtimeExposureUsd: r.downtimeExposureUsd,
    currentStatus: r.currentStatus,
    // No open_atrisk row → not at risk → no part-expedite concern.
    partLocal: r.partLocal ?? true,
    partId: r.partId ?? null,
    partLeadTimeDays: r.partLeadTimeDays ?? 0,
  };
}

// action_ranking is stored as the raw gold JSON (snake_case keys), not the
// camelCase MaintenanceActionOption shape — parse defensively with Zod.
const rankItemSchema = z.object({
  action: z.string(),
  predicted_downtime_cost_avoided_usd: z.number().nullish(),
  action_cost_usd: z.number().nullish(),
  net: z.number().nullish(),
});

/** The ML/heuristic ranked actions for a line (app.maintenance_recommendations). */
export async function getRecommendation(
  db: AppDb,
  lineId: string,
): Promise<{
  lineId: string;
  recommendedAction: 'pull_now' | 'run_to_shift_end' | 'expedite_parts_and_run';
  predictedDowntimeCostUsd: number;
  actionRanking: Array<{
    action: string;
    costUsd: number;
    predictedCostAvoided: number;
    netValue: number;
  }>;
} | null> {
  const rows = await db
    .select()
    .from(maintenanceRecommendations)
    .where(eq(maintenanceRecommendations.lineId, lineId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const parsed = z.array(rankItemSchema).safeParse(r.actionRanking);
  const actionRanking = (parsed.success ? parsed.data : []).map((it) => ({
    action: it.action,
    costUsd: it.action_cost_usd ?? 0,
    predictedCostAvoided: it.predicted_downtime_cost_avoided_usd ?? 0,
    netValue: it.net ?? 0,
  }));
  return {
    lineId: r.lineId,
    recommendedAction: r.recommendedAction,
    predictedDowntimeCostUsd: r.predictedDowntimeCostUsd ?? 0,
    actionRanking,
  };
}

/**
 * Lakebase Search over the parts catalog (app.parts) — full-text over
 * part name + description, ranked by relevance. Returns the top matches.
 */
export async function searchParts(
  db: AppDb,
  query: string,
): Promise<
  Array<{
    partId: string;
    partName: string;
    partCategory: string;
    partLocal: boolean;
    leadTimeDays: number;
  }>
> {
  if (!query.trim()) return [];
  const rowSchema = z.object({
    part_id: z.string(),
    part_name: z.string(),
    part_category: z.string().nullish(),
    part_local: z.boolean(),
    lead_time_days: z.number().nullish(),
  });
  const runFts = async () =>
    db.execute(sql`
      SELECT part_id, part_name, part_category, part_local, lead_time_days
      FROM app.parts
      WHERE to_tsvector('english', coalesce(part_name, '') || ' ' || coalesce(description, ''))
            @@ websearch_to_tsquery('english', ${query})
      ORDER BY ts_rank(
        to_tsvector('english', coalesce(part_name, '') || ' ' || coalesce(description, '')),
        websearch_to_tsquery('english', ${query})
      ) DESC
      LIMIT 10`);
  const runIlike = async () =>
    db.execute(sql`
      SELECT part_id, part_name, part_category, part_local, lead_time_days
      FROM app.parts
      WHERE part_name ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'}
      LIMIT 10`);

  let res = await runFts();
  if (res.rows.length === 0) res = await runIlike();
  return z
    .array(rowSchema)
    .parse(res.rows)
    .map((r) => ({
      partId: r.part_id,
      partName: r.part_name,
      partCategory: r.part_category ?? 'unknown',
      partLocal: r.part_local,
      leadTimeDays: r.lead_time_days ?? 0,
    }));
}

/**
 * Record an approved maintenance action to the app-owned app.work_orders_app
 * (the only table the app writes). Filter-driven + transactional; appends an
 * audit entry. Returns the new work-order id.
 */
export async function recordMaintenanceAction(
  db: AppDb,
  args: {
    lineId: string;
    actionType: 'pull_now' | 'run_to_shift_end' | 'expedite_parts_and_run';
    partId: string | null;
    draftedWo: string;
    predictedDowntimeCostAvoidsUsd: number | null;
    userEmail: string;
  },
): Promise<{ actionId: string }> {
  const auditEntry: MaintenanceAuditEntry = {
    at: new Date().toISOString(),
    by: args.userEmail,
    action: 'approved',
    notes: 'Maintenance action recorded',
    tool: 'execute_maintenance_action',
  };
  const rows = await db.transaction(async (tx) =>
    tx
      .insert(workOrdersApp)
      .values({
        lineId: args.lineId,
        actionType: args.actionType,
        partId: args.partId,
        draftedWo: args.draftedWo,
        predictedDowntimeCostAvoidsUsd: args.predictedDowntimeCostAvoidsUsd,
        status: 'approved',
        approvedBy: args.userEmail,
        auditTrail: [auditEntry],
        decidedAt: new Date(),
      })
      .returning({ id: workOrdersApp.id }),
  );
  return { actionId: rows[0].id };
}
