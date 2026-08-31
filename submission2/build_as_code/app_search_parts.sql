-- App build construct: how the Volta Plant Floor agent's `search_parts` tool
-- RETRIEVES from the Build-1 Lakebase Search index — it reads the shared
-- `parts_search` table (built in Build 1's lakebase_search_setup.sql) via the
-- `parts_search_bm25` (lakebase_bm25) index. It does NOT query a separate
-- app-owned store (the old app.parts full-text path was removed).
--
-- Source: app/server/db/queries/maintenance.ts → searchParts()
--   - the schema/index name come from the DEMO_SCHEMA env (trusted, inlined as
--     an identifier); the query text is a bound parameter ($1).
--   - the app SP is granted USAGE on the schema + SELECT on parts_search
--     (see the GRANTs at the bottom).

-- BM25 keyword retrieval against the Build-1 lakebase_bm25 index -----------------
SELECT part_id, part_name, part_type AS part_category, part_local, lead_time_days
FROM "dev_manffred_calvosanchez_volta_industrial".parts_search
ORDER BY body_tsv <@> to_bm25query(
           to_tsvector('english', $1),                       -- $1 = query text (bound)
           'dev_manffred_calvosanchez_volta_industrial.parts_search_bm25')
LIMIT 10;

-- Fallback (still the SAME Build-1 parts_search index table — never app.parts) --
-- SELECT part_id, part_name, part_type AS part_category, part_local, lead_time_days
-- FROM "dev_manffred_calvosanchez_volta_industrial".parts_search
-- WHERE body_tsv @@ websearch_to_tsquery('english', $1)
-- ORDER BY ts_rank(body_tsv, websearch_to_tsquery('english', $1)) DESC
-- LIMIT 10;

-- Access grant: the app service principal reads the shared Build-1 index -------
-- (it does not own parts_search; owner is the workspace user).
-- GRANT USAGE  ON SCHEMA "dev_manffred_calvosanchez_volta_industrial" TO "189e02a2-c9f9-46af-8900-55de599fa319";
-- GRANT SELECT ON "dev_manffred_calvosanchez_volta_industrial".parts_search TO "189e02a2-c9f9-46af-8900-55de599fa319";
