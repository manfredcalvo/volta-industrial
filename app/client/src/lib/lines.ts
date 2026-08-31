/**
 * REST helpers for the operations domain (production lines / plants /
 * activity feed). Types live in `shared/types.ts`; this file is only
 * `fetch` calls. Analytics chart data comes from `/api/charts/<key>`
 * (see AnalyticsView), not here.
 */
import { okOrThrow } from './api';
import type {
  LineRow,
  LineDetail,
  StatusSummary,
  PlantRow,
  ActivityEvent,
} from '@/shared/types';

export async function fetchLines(): Promise<LineRow[]> {
  const res = await okOrThrow(await fetch('/api/lines'), '/api/lines');
  return res.json();
}

export async function fetchLine(id: string): Promise<LineDetail> {
  const res = await okOrThrow(
    await fetch(`/api/lines/${encodeURIComponent(id)}`),
    `/api/lines/${id}`,
  );
  return res.json();
}

export async function fetchLineSummary(): Promise<StatusSummary[]> {
  const res = await okOrThrow(
    await fetch('/api/lines/summary'),
    '/api/lines/summary',
  );
  return res.json();
}

export async function fetchPlantSummary(): Promise<PlantRow[]> {
  const res = await okOrThrow(
    await fetch('/api/plants/summary'),
    '/api/plants/summary',
  );
  return res.json();
}

export async function fetchActivity(limit = 20): Promise<ActivityEvent[]> {
  const res = await okOrThrow(
    await fetch(`/api/activity/recent?limit=${limit}`),
    '/api/activity/recent',
  );
  return res.json();
}

/** Chart data from the warehouse-backed /api/charts route. Rows are
 *  untyped at the boundary; callers narrow per chart key. */
export async function fetchChart<T = Record<string, unknown>>(
  key: string,
): Promise<T[]> {
  const res = await okOrThrow(
    await fetch(`/api/charts/${key}`),
    `/api/charts/${key}`,
  );
  const body = (await res.json()) as { data?: T[] };
  return body.data ?? [];
}
