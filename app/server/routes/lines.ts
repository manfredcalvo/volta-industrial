/**
 * Operations REST endpoints — the line queue, detail drawer, plant
 * rollups, and the activity feed. All read the low-latency Lakebase
 * `app.*` mirror via server/db/queries/operations.ts. Analytics (richer
 * warehouse dims) is served separately by routes/charts.ts.
 */
import type { Application, Request, Response } from 'express';
import type { AppDb } from '../db/index.js';
import {
  listLines,
  lineSummary,
  lineDetail,
  plantSummary,
  recentActivity,
} from '../db/queries/operations.js';

export function registerLinesRoutes(
  app: Application,
  deps: { db: AppDb },
): void {
  const { db } = deps;

  app.get('/api/lines', async (_req: Request, res: Response) => {
    res.json(await listLines(db));
  });

  app.get('/api/lines/summary', async (_req: Request, res: Response) => {
    res.json(await lineSummary(db));
  });

  // Recent agent activity (work orders). Registered before the :id route
  // isn't necessary (distinct path), but grouped here for clarity.
  app.get('/api/activity/recent', async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await recentActivity(db, limit));
  });

  app.get('/api/plants/summary', async (_req: Request, res: Response) => {
    res.json(await plantSummary(db));
  });

  app.get('/api/lines/:id', async (req: Request, res: Response) => {
    const detail = await lineDetail(db, String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: `Unknown line: ${req.params.id}` });
      return;
    }
    res.json(detail);
  });
}
