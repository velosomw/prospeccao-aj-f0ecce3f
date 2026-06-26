
-- Adiciona infra para PDF split + roteamento de chunks

ALTER TABLE public.deferred_jobs
  ADD COLUMN IF NOT EXISTS split_parent_id uuid REFERENCES public.deferred_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chunk_index integer,
  ADD COLUMN IF NOT EXISTS chunks_total integer;

CREATE INDEX IF NOT EXISTS idx_deferred_jobs_split_parent
  ON public.deferred_jobs(split_parent_id)
  WHERE split_parent_id IS NOT NULL;

-- Tabela de controle do split
CREATE TABLE IF NOT EXISTS public.pdf_split_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_file_id text NOT NULL,
  parent_deferred_job_id uuid REFERENCES public.deferred_jobs(id) ON DELETE SET NULL,
  parent_document_id uuid,
  total_chunks integer NOT NULL,
  chunks_done integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'splitting',
  rma_id text,
  company_id uuid,
  merged_extraction_id uuid,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

GRANT SELECT ON public.pdf_split_jobs TO authenticated;
GRANT ALL ON public.pdf_split_jobs TO service_role;

ALTER TABLE public.pdf_split_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdf_split_jobs_admin_all"
  ON public.pdf_split_jobs
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "pdf_split_jobs_consultor_read"
  ON public.pdf_split_jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'consultor'::app_role)
         AND rma_id IS NOT NULL
         AND public.can_access_company_by_rma(rma_id));

CREATE INDEX idx_pdf_split_jobs_parent_file ON public.pdf_split_jobs(parent_file_id);
CREATE INDEX idx_pdf_split_jobs_status ON public.pdf_split_jobs(status);

CREATE TRIGGER pdf_split_jobs_updated_at
  BEFORE UPDATE ON public.pdf_split_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: incrementa chunks_done e marca done quando atinge total
CREATE OR REPLACE FUNCTION public.pdf_split_increment_done(p_parent_file_id text)
RETURNS public.pdf_split_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.pdf_split_jobs;
BEGIN
  UPDATE public.pdf_split_jobs
     SET chunks_done = chunks_done + 1,
         status = CASE WHEN chunks_done + 1 >= total_chunks THEN 'ready_to_merge' ELSE status END,
         updated_at = now()
   WHERE parent_file_id = p_parent_file_id
     AND status IN ('splitting','processing')
   RETURNING * INTO r;
  RETURN r;
END;
$$;
