
DROP VIEW IF EXISTS public.folder_processing_status;

CREATE VIEW public.folder_processing_status
WITH (security_invoker = true) AS
SELECT
  pq.company_id,
  pq.rma_id,
  COALESCE(pq.payload->>'folder_path', 'unknown') AS folder_path,
  COUNT(*) FILTER (WHERE pq.status = 'done') AS done_count,
  COUNT(*) FILTER (WHERE pq.status = 'processing') AS processing_count,
  COUNT(*) FILTER (WHERE pq.status = 'pending' AND pq.block_reason = 'rate_limit') AS rate_limited_count,
  COUNT(*) FILTER (WHERE pq.status = 'pending' AND COALESCE(pq.block_reason,'') <> 'rate_limit') AS pending_count,
  COUNT(*) FILTER (WHERE pq.status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE pq.parent_job_id IS NOT NULL) AS chunk_count,
  COUNT(*) AS total_count,
  MIN(pq.next_attempt_at) FILTER (WHERE pq.status = 'pending' AND pq.block_reason = 'rate_limit') AS rate_limit_until,
  MAX(pq.updated_at) AS last_activity_at
FROM public.processing_queue pq
GROUP BY pq.company_id, pq.rma_id, COALESCE(pq.payload->>'folder_path', 'unknown');

GRANT SELECT ON public.folder_processing_status TO authenticated;
