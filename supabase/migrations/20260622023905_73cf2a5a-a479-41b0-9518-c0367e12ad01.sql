
UPDATE public.batch_processing_config SET max_batch_size = 4 WHERE id = 1;

UPDATE public.deferred_jobs
SET status = 'queued', attempts = 0, error_message = NULL, eta_at = now()
WHERE status = 'failed'
  AND error_message ILIKE '%Quota limit%ConcurrentBatchProcess%';
