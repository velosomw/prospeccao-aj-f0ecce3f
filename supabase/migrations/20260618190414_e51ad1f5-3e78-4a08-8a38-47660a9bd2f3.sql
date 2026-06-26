
-- 1) Deduplica jobs em erro pelo mesmo file_id (mantém o mais recente)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY updated_at DESC, created_at DESC) AS rn
    FROM public.processing_queue
   WHERE company_id = '25091c18-8fdc-4923-8fdb-58c250649292'
     AND status = 'error'
     AND error_message ILIKE '%22P05%'
)
DELETE FROM public.processing_queue pq
 USING ranked r
 WHERE pq.id = r.id AND r.rn > 1;

-- 2) Requeue os remanescentes (agora únicos por file_id)
UPDATE public.processing_queue
   SET status = 'pending',
       attempts = 0,
       picked_at = NULL,
       lock_until = NULL,
       locked_by = NULL,
       error_message = NULL,
       next_attempt_at = now()
 WHERE company_id = '25091c18-8fdc-4923-8fdb-58c250649292'
   AND status = 'error'
   AND error_message ILIKE '%22P05%'
   AND NOT EXISTS (
     SELECT 1 FROM public.processing_queue x
      WHERE x.file_id = processing_queue.file_id
        AND x.status IN ('pending','processing')
   );

-- 3) Libera jobs "processing" presos
UPDATE public.processing_queue
   SET status = 'pending',
       picked_at = NULL,
       lock_until = NULL,
       locked_by = NULL,
       attempts = 0,
       next_attempt_at = now()
 WHERE company_id = '25091c18-8fdc-4923-8fdb-58c250649292'
   AND status = 'processing'
   AND (lock_until IS NULL OR lock_until < now())
   AND (picked_at IS NULL OR picked_at < now() - interval '1 hour');

-- 4) Reseta análise travada
UPDATE public.rma_analysis_results
   SET status = 'erro',
       error_message = COALESCE(error_message, '') || ' [auto-reset: OCR estava bloqueado por NUL bytes — corrigido]',
       finished_at = now()
 WHERE company_id = '25091c18-8fdc-4923-8fdb-58c250649292'
   AND status = 'em_analise';
