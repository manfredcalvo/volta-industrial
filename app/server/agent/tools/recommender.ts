/**
 * Live call to the `failure_recommender` serving endpoint (the MLflow model
 * registered as `<catalog>.<schema>.failure_recommender@prod`, served by
 * ml/train_register.py + ml/score_serve.py).
 *
 * The batch ranking in app.maintenance_recommendations answers "what should we
 * do about this line *as it is*". This helper answers what-ifs the batch table
 * can't: "what if the part were stocked locally?", "what if risk climbs to
 * 0.95 by end of shift?". It scores all three candidate actions in ONE
 * invocation, so the ranking is computed by the same artifact as the batch job.
 *
 * Governance: the endpoint has AI Gateway enabled (usage tracking → the
 * system.serving tables, payloads → the `volta_recommender_payload` inference
 * table, per-user rate limit). Auth is the app SERVICE PRINCIPAL with CAN_QUERY
 * on the bound serving-endpoint resource — same rationale as the model and
 * Genie calls (see lib/auth.ts serviceAuthHeaders).
 */
import { serviceAuthHeaders } from '../../lib/auth.js';

export const ACTIONS = ['pull_now', 'run_to_shift_end', 'expedite_parts_and_run'] as const;
export type MaintenanceAction = (typeof ACTIONS)[number];

/** One line situation — the model's input features (minus action_type). */
export type LineScenario = {
  risk_at_action: number;
  part_local: boolean;
  criticality: string | null;
  machine_type: string | null;
  part_lead_time_days: number | null;
};

export type ScoredAction = {
  action_type: MaintenanceAction;
  predicted_downtime_cost_avoided_usd: number;
  predicted_action_cost_usd: number;
  predicted_net_value_usd: number;
};

/** Score the three candidate actions for a scenario, best net value first. */
export async function scoreScenario(
  databricksHost: string,
  endpointName: string,
  scenario: LineScenario,
): Promise<ScoredAction[]> {
  const headers = await serviceAuthHeaders();
  headers.set('Content-Type', 'application/json');
  const resp = await fetch(`${databricksHost}/serving-endpoints/${endpointName}/invocations`, {
    method: 'POST',
    headers,
    // Scale-to-zero cold start can take a couple of minutes; a warm call is ~100ms.
    signal: AbortSignal.timeout(3 * 60 * 1000),
    body: JSON.stringify({
      dataframe_records: ACTIONS.map((action_type) => ({ action_type, ...scenario })),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[predict_action_value] endpoint call failed', {
      status: resp.status,
      body: body.slice(0, 500),
    });
    throw new Error(`failure_recommender endpoint returned ${resp.status}: ${body.slice(0, 200)}`);
  }
  const { predictions } = (await resp.json()) as { predictions: ScoredAction[] };
  return [...predictions].sort((a, b) => b.predicted_net_value_usd - a.predicted_net_value_usd);
}
