# Parts search retrieves from the Build-1 Lakebase Search index

The app's `search_parts` tool retrieves from the **shared Build-1 Lakebase
Search index** — `dev_manffred_calvosanchez_volta_industrial.parts_search`,
backed by the `parts_search_bm25` (lakebase_bm25) and `parts_search_ann`
(lakebase_ann) indexes built in Build 1's `lakebase_search_setup.sql`. It does
**not** maintain a separate search store.

## Build-1 index construct (from lakebase_search_setup.sql)

```sql
-- Lakebase Search extensions
CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;   -- ANN vector search
CREATE EXTENSION IF NOT EXISTS lakebase_text;             -- BM25 full-text search

-- Search-ready table (BM25 tsvector + vector(1024)) built from the synced parts mirror
CREATE TABLE dev_manffred_calvosanchez_volta_industrial.parts_search AS
SELECT part_id, part_name, part_type, machine_type, unit_cost_usd, lead_time_days,
       local_stock_qty, part_local, description, search_text,
       to_tsvector('english', search_text) AS body_tsv,
       (... description_embedding ...)::vector(1024) AS embedding
FROM dev_manffred_calvosanchez_volta_industrial.parts;

CREATE INDEX parts_search_ann  ON ...parts_search USING lakebase_ann  (embedding vector_cosine_ops);
CREATE INDEX parts_search_bm25 ON ...parts_search USING lakebase_bm25 (body_tsv);
```

## App build construct (server/db/queries/maintenance.ts → searchParts)

The tool reads from `parts_search` via the `parts_search_bm25` lakebase_bm25
index (query text is a bound parameter; the schema/index name come from the
`DEMO_SCHEMA` env, not user input):

```sql
SELECT part_id, part_name, part_type AS part_category, part_local, lead_time_days
FROM "dev_manffred_calvosanchez_volta_industrial".parts_search
ORDER BY body_tsv <@> to_bm25query(
           to_tsvector('english', $1),
           'dev_manffred_calvosanchez_volta_industrial.parts_search_bm25')
LIMIT 10;
```

`search_parts` is wired into the agent (server/agent/plantfloor.ts) as the
`search_parts` tool for the "expedite parts" play.

## Access grant (app SP → Build-1 index)

The app service principal (`189e02a2-c9f9-46af-8900-55de599fa319`) is granted
read on the shared Build-1 schema/table (the SP does not own it):

```sql
GRANT USAGE  ON SCHEMA "dev_manffred_calvosanchez_volta_industrial" TO "189e02a2-c9f9-46af-8900-55de599fa319";
GRANT SELECT ON "dev_manffred_calvosanchez_volta_industrial".parts_search TO "189e02a2-c9f9-46af-8900-55de599fa319";
```

## Evidence files (Build-1 layout)

- `build_as_code/lakebase_search_setup.sql` — the Build-1 index construct
  (`parts_search` + `lakebase_bm25`/`lakebase_ann`).
- `build_as_code/app_search_parts.sql` — the app's retrieval query against that
  index (BM25 over `parts_search.body_tsv` via `parts_search_bm25`) + the SP grant.
- `execution_evidence/lakebase_search_indexes.json` — the extensions +
  `parts_search_ann`/`parts_search_bm25` index defs the app retrieves against
  (800 rows in `parts_search`).
- `execution_evidence/search_execution.json` — a live agent run: the
  `search_parts` tool call (`query: "bearing seal coupling"`) + its 10 candidates
  from `parts_search`.
- `search_query.txt` + `search_result.json` — the NL query + the returned records.

The returned top parts (PART-00091, PART-00566, PART-00343, PART-00157,
PART-00759 …) match a direct BM25 query against the Build-1 `parts_search` index
— confirming retrieval from that index, not a separate store.
