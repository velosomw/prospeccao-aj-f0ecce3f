
-- 1. Tabela de jobs deferred (batch)
CREATE TABLE IF NOT EXISTS public.deferred_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id text NOT NULL,
  company_id uuid,
  rma_id text,
  folder_path text,
  file_name text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  page_count_estimate integer,
  engine text NOT NULL DEFAULT 'document_ai_batch',
  status text NOT NULL DEFAULT 'queued', -- queued|submitted|polling|done|failed|cancelled
  gcs_input_uri text,
  gcs_output_uri text,
  operation_name text,
  submitted_at timestamptz,
  eta_at timestamptz,
  completed_at timestamptz,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  document_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deferred_jobs_status ON public.deferred_jobs(status, eta_at);
CREATE INDEX IF NOT EXISTS idx_deferred_jobs_company ON public.deferred_jobs(company_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_deferred_jobs_folder ON public.deferred_jobs(company_id, rma_id, folder_path);
CREATE INDEX IF NOT EXISTS idx_deferred_jobs_file ON public.deferred_jobs(file_id);

ALTER TABLE public.deferred_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deferred_jobs_admin_all" ON public.deferred_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "deferred_jobs_consultor_read" ON public.deferred_jobs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = deferred_jobs.company_id
        AND (c.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.company_consultants cc
                     WHERE cc.company_id = c.id AND cc.consultant_user_id = auth.uid()))
    )
  );

CREATE TRIGGER trg_deferred_jobs_updated_at
  BEFORE UPDATE ON public.deferred_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Marca processing_mode em processing_queue
ALTER TABLE public.processing_queue
  ADD COLUMN IF NOT EXISTS processing_mode text NOT NULL DEFAULT 'sync';
-- valores: sync | deferred

-- 3. Configuração singleton
CREATE TABLE IF NOT EXISTS public.batch_processing_config (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  threshold_size_mb integer NOT NULL DEFAULT 10,
  threshold_pages integer NOT NULL DEFAULT 50,
  default_eta_hours integer NOT NULL DEFAULT 6,
  max_eta_hours integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_config_singleton CHECK (id = 1)
);
INSERT INTO public.batch_processing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.batch_processing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batch_config_read_all_auth" ON public.batch_processing_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "batch_config_write_gestor" ON public.batch_processing_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

-- 4. View agregada por pasta
CREATE OR REPLACE VIEW public.folder_deferred_status
WITH (security_invoker = true)
AS
SELECT
  company_id,
  rma_id,
  folder_path,
  COUNT(*) FILTER (WHERE status IN ('queued','submitted','polling')) AS in_batch_count,
  COUNT(*) FILTER (WHERE status = 'done') AS done_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) AS total_count,
  MIN(eta_at) FILTER (WHERE status IN ('queued','submitted','polling')) AS earliest_eta,
  MAX(eta_at) FILTER (WHERE status IN ('queued','submitted','polling')) AS latest_eta
FROM public.deferred_jobs
GROUP BY company_id, rma_id, folder_path;

-- 5. RPC: roteador — decide se file deve ir para batch
CREATE OR REPLACE FUNCTION public.should_defer_file(
  p_size_bytes bigint,
  p_pages integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.batch_processing_config;
BEGIN
  SELECT * INTO cfg FROM public.batch_processing_config WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled THEN RETURN false; END IF;
  IF p_size_bytes IS NOT NULL AND p_size_bytes > (cfg.threshold_size_mb::bigint * 1024 * 1024) THEN
    RETURN true;
  END IF;
  IF p_pages IS NOT NULL AND p_pages > cfg.threshold_pages THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- 6. RPC: enfileira deferred (idempotente por file_id)
CREATE OR REPLACE FUNCTION public.enqueue_deferred_job(
  p_file_id text,
  p_company_id uuid,
  p_rma_id text,
  p_folder_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_pages integer,
  p_document_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.batch_processing_config;
  new_id uuid;
BEGIN
  SELECT * INTO cfg FROM public.batch_processing_config WHERE id = 1;

  -- Já existe job ativo para este file?
  SELECT id INTO new_id FROM public.deferred_jobs
   WHERE file_id = p_file_id AND status NOT IN ('done','failed','cancelled')
   LIMIT 1;
  IF FOUND THEN RETURN new_id; END IF;

  INSERT INTO public.deferred_jobs (
    file_id, company_id, rma_id, folder_path, file_name, mime_type,
    file_size_bytes, page_count_estimate, document_id, payload,
    eta_at
  ) VALUES (
    p_file_id, p_company_id, p_rma_id, p_folder_path, p_file_name, p_mime_type,
    p_size_bytes, p_pages, p_document_id, COALESCE(p_payload,'{}'::jsonb),
    now() + make_interval(hours => COALESCE(cfg.default_eta_hours, 6))
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
