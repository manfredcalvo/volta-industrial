-- Lakebase Search setup for the Volta parts catalog (Milestone 2).
-- Ref: https://docs.databricks.com/aws/en/oltp/projects/lakebase-search
--
-- PREREQUISITES (done outside this script):
--   1. `gold_parts` MV in the SDP pipeline carries `search_text` (lexical) + `description_embedding`
--      (ai_query('databricks-gte-large-en', ...) → 1024-d).
--   2. `parts` synced table (postgres_synced_tables.parts_sync) mirrors it into Lakebase
--      (embedding arrives as JSONB; synced tables are READ-ONLY so we can't index them directly).
--   3. Lakebase Search ENABLED on the project (UI, Beta, irreversible — loads shared_preload_libraries).
--
-- Schema below is the dev-target schema; swap for prod. Run against the Lakebase Postgres DB.

-- 1. Lakebase Search extensions -------------------------------------------------
CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;   -- ANN vector search (auto-installs pgvector)
CREATE EXTENSION IF NOT EXISTS lakebase_text;             -- BM25 full-text search

-- 2. Search-ready table built from the read-only synced `parts` mirror ----------
--    Materializes a tsvector (BM25) + a vector(1024) (ANN) column, which the synced
--    table itself cannot hold. Refresh by re-running this block after a parts re-sync.
DROP TABLE IF EXISTS dev_manffred_calvosanchez_volta_industrial.parts_search;
CREATE TABLE dev_manffred_calvosanchez_volta_industrial.parts_search AS
SELECT part_id, part_name, part_type, machine_type, unit_cost_usd, lead_time_days,
       local_stock_qty, part_local, description, search_text,
       to_tsvector('english', search_text) AS body_tsv,
       (SELECT array_agg(x::float8 ORDER BY ord)
          FROM jsonb_array_elements_text(description_embedding) WITH ORDINALITY AS t(x, ord)
       )::vector(1024) AS embedding
FROM dev_manffred_calvosanchez_volta_industrial.parts;
ALTER TABLE dev_manffred_calvosanchez_volta_industrial.parts_search ADD PRIMARY KEY (part_id);

-- 3. Lakebase Search indexes ----------------------------------------------------
CREATE INDEX parts_search_ann  ON dev_manffred_calvosanchez_volta_industrial.parts_search
  USING lakebase_ann  (embedding vector_cosine_ops);
CREATE INDEX parts_search_bm25 ON dev_manffred_calvosanchez_volta_industrial.parts_search
  USING lakebase_bm25 (body_tsv);

-- 4. search_parts — hybrid RRF query (bind :q = query text, :qvec = ai_query embedding of :q) --
-- WITH vector_ranked AS (
--   SELECT part_id, RANK() OVER (ORDER BY dist) AS rank FROM (
--     SELECT part_id, embedding <=> :qvec::vector AS dist
--     FROM dev_manffred_calvosanchez_volta_industrial.parts_search ORDER BY dist LIMIT 40) v),
-- keyword_ranked AS (
--   SELECT part_id, RANK() OVER (ORDER BY score) AS rank FROM (
--     SELECT part_id, body_tsv <@> to_bm25query(to_tsvector('english', :q),
--              'dev_manffred_calvosanchez_volta_industrial.parts_search_bm25') AS score
--     FROM dev_manffred_calvosanchez_volta_industrial.parts_search ORDER BY score LIMIT 40) k)
-- SELECT p.part_id, p.part_name, p.part_local, p.lead_time_days,
--   COALESCE(1.0/(60+v.rank),0) + COALESCE(1.0/(60+k.rank),0) AS rrf_score
-- FROM dev_manffred_calvosanchez_volta_industrial.parts_search p
-- LEFT JOIN vector_ranked v USING(part_id)
-- LEFT JOIN keyword_ranked k USING(part_id)
-- WHERE v.part_id IS NOT NULL OR k.part_id IS NOT NULL
-- ORDER BY rrf_score DESC, part_id LIMIT 10;
