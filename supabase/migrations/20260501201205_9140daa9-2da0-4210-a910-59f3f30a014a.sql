UPDATE public.processing_queue
SET status = 'pending',
    attempts = 0,
    error_message = NULL,
    finished_at = NULL,
    picked_at = NULL
WHERE company_id = '0c8e41f8-6675-472d-b5c4-633fbade5975'
  AND mes = 2
  AND status IN ('error', 'processing');