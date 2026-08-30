-- gold_parts — the replacement-parts catalog as a UC table (raw_parts is only parquet), mirrored
-- into Lakebase (as `parts`) and indexed by Lakebase Search for the expedite-parts play
-- (the agent's search_parts tool). Carries the lexical text (BM25) + a semantic embedding
-- (lakebase_ann vector search).
CREATE OR REFRESH MATERIALIZED VIEW gold_parts AS
SELECT
  part_id,
  part_name,
  part_type,
  machine_type,
  unit_cost_usd,
  lead_time_days,
  local_stock_qty,
  (local_stock_qty > 0)                                   AS part_local,
  description,
  is_active,
  -- lexical text that Lakebase Search (lakebase_bm25) tokenizes into a tsvector Postgres-side.
  CONCAT_WS(' ', part_name, part_type, machine_type, description) AS search_text,
  -- semantic embedding for lakebase_ann (databricks-gte-large-en → 1024-d).
  ai_query('databricks-gte-large-en',
           CONCAT_WS(' ', part_name, description))        AS description_embedding
FROM read_files('/Volumes/${catalog}/${schema}/raw_data/parts', format => 'parquet');
