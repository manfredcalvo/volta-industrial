import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { AppDb } from './index.js';

// App-authored (writable) tables whose change history is streamed back to Unity
// Catalog via the Lakebase reverse-sync CDF (config `volta_app_cdf` → catalog
// serverless_sandbox_pk6i1q_catalog.volta_cdf). Lakebase CDF REQUIRES
// `REPLICA IDENTITY FULL` on a table for it to participate — without it the
// table never materializes into the destination `lb_<table>_history`. The app
// SP owns these tables, so it sets the identity here (a non-owner cannot).
// The sync-populated mirror tables (line_status/open_atrisk/... ) are excluded
// on purpose — they already flow UC→Lakebase, so reverse-CDF'ing them is churn.
const CDF_REPLICA_IDENTITY_FULL_TABLES = [
  'work_orders_app', // approval writeback — the reverse-sync payload
  'conversations',
  'messages',
  'feedback',
] as const;

/**
 * Sets REPLICA IDENTITY FULL on the app's writable tables so they participate in
 * the Lakebase reverse-sync CDF. Idempotent and safe on every boot. Per-table
 * try/catch: a permission error (non-owner) is logged, never fatal to startup.
 */
async function ensureCdfReplicaIdentity(db: AppDb): Promise<void> {
  for (const t of CDF_REPLICA_IDENTITY_FULL_TABLES) {
    try {
      await db.execute(sql.raw(`ALTER TABLE app.${t} REPLICA IDENTITY FULL`));
    } catch (err) {
      console.warn(
        `[cdf] could not set REPLICA IDENTITY FULL on app.${t} (non-owner?): ${
          (err as Error).message
        }`,
      );
    }
  }
}

/**
 * Runs committed SQL migrations from ./drizzle/ at app startup.
 *
 * - Safe to call on every boot: Drizzle's migrator tracks applied migrations
 *   in a meta table and is a no-op if everything is up to date.
 * - In dev, the current user is the project owner (DDL allowed).
 * - In prod, the service principal runs this on first deploy, becomes the
 *   owner of `app` schema, and can run future migrations.
 *
 * NB: the migrations folder path is computed relative to this source file so
 * it resolves both under tsx-watch (dev) and tsdown-bundled (prod).
 */
export async function runMigrations(db: AppDb): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Dev: server/db/migrate.ts → ../../drizzle
  // Prod (bundled to dist/server.js): dist/ → ../drizzle
  const candidates = [
    resolve(here, '../../drizzle'),
    resolve(here, '../drizzle'),
  ];
  const fs = await import('node:fs');
  const migrationsFolder = candidates.find((p) => fs.existsSync(p));
  if (!migrationsFolder) {
    throw new Error(
      `No Drizzle migrations folder found. Tried: ${candidates.join(', ')}. ` +
        `Run \`npm run db:generate\` first.`,
    );
  }
  await migrate(db, { migrationsFolder });
  await ensureCdfReplicaIdentity(db);
}
