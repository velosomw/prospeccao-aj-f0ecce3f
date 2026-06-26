-- Dead Letter Queue para jobs que esgotaram tentativas no worker do pipeline
CREATE TABLE IF NOT EXISTS public.failed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id uuid,
  file_id text NOT NULL,
  company_id uuid,
  rma_id text,
  ano integer,
  mes integer,
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  payload jsonb DEFAULT '{}'::jsonb,
  failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_jobs_file ON public.failed_jobs(file_id);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_rma ON public.failed_jobs(rma_id);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_unresolved ON public.failed_jobs(failed_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.failed_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam failed_jobs" ON public.failed_jobs;
CREATE POLICY "Admins gerenciam failed_jobs"
  ON public.failed_jobs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

-- Função utilitária: arquiva um job na DLQ a partir da processing_queue
CREATE OR REPLACE FUNCTION public.archive_failed_job(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.processing_queue%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO q FROM public.processing_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing_queue % não encontrado', p_queue_id;
  END IF;

  INSERT INTO public.failed_jobs (
    original_queue_id, file_id, company_id, rma_id, ano, mes,
    reason, attempts, error_message, payload
  ) VALUES (
    q.id, q.file_id, q.company_id, q.rma_id, q.ano, q.mes,
    q.reason, q.attempts, q.error_message, q.payload
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_failed_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_failed_job(uuid) TO service_role;