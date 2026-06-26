UPDATE public.ai_extractions
SET status='failed',
    error_message=COALESCE(NULLIF(error_message,''),'Watchdog: job órfão (>10min sem progresso) — worker abandonou'),
    updated_at=now()
WHERE status='processing' AND updated_at < now() - interval '10 minutes';

UPDATE public.processing_queue
SET status='error',
    error_message=COALESCE(NULLIF(error_message,''),'Watchdog: item órfão (>10min sem progresso) — worker abandonou'),
    updated_at=now()
WHERE status='processing' AND updated_at < now() - interval '10 minutes';