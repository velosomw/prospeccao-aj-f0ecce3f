
-- Move jobs travados em 'processing' há > 10min para 'error'
UPDATE public.processing_queue
   SET status='error',
       error_message=COALESCE(error_message,'') || ' [timeout: worker inativo - destravado]',
       updated_at=now()
 WHERE company_id='0c8e41f8-6675-472d-b5c4-633fbade5975'
   AND status='processing'
   AND updated_at < now() - interval '10 minutes';

-- Move 'pending' travados em rate-limit há > 30min para 'skipped' (libera UI)
UPDATE public.processing_queue
   SET status='skipped',
       error_message=COALESCE(error_message,'') || ' [skip: rate-limit persistente, reprocessar em batch]',
       updated_at=now()
 WHERE company_id='0c8e41f8-6675-472d-b5c4-633fbade5975'
   AND status='pending'
   AND updated_at < now() - interval '30 minutes';
