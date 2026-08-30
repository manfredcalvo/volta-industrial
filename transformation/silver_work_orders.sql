-- silver_work_orders — per-line work-order rollup: open count, open-corrective flag,
-- and the part needed on the latest open work order (drives part_local + expedite context).
CREATE OR REFRESH MATERIALIZED VIEW silver_work_orders AS
WITH wo AS (
  SELECT line_id, wo_type, part_id, opened_date, status
  FROM read_files('/Volumes/${catalog}/${schema}/raw_data/work_orders', format => 'parquet')
),
rollup AS (
  SELECT
    line_id,
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_wo_count,
    MAX(CASE WHEN status = 'open' AND wo_type = 'corrective' THEN true ELSE false END) AS has_open_corrective
  FROM wo
  GROUP BY line_id
),
latest_open_part AS (
  SELECT line_id, part_id AS latest_part_id
  FROM (
    SELECT
      line_id,
      part_id,
      ROW_NUMBER() OVER (PARTITION BY line_id ORDER BY opened_date DESC) AS rn
    FROM wo
    WHERE status = 'open' AND part_id IS NOT NULL
  )
  WHERE rn = 1
)
SELECT
  r.line_id,
  r.open_wo_count,
  r.has_open_corrective,
  p.latest_part_id
FROM rollup r
LEFT JOIN latest_open_part p USING (line_id);
