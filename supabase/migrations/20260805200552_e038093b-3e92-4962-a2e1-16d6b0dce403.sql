-- PARTE 5: Certificação, Status e Logs

ALTER TABLE public.prospeccao_linhas
  ADD COLUMN IF NOT EXISTS status_certificacao text NOT NULL DEFAULT 'Em Processamento',
  ADD COLUMN IF NOT EXISTS certificacao jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mes_referencia text,
  ADD COLUMN IF NOT EXISTS data_distribuicao date,
  ADD COLUMN IF NOT EXISTS doc_hash text;

CREATE INDEX IF NOT EXISTS idx_linhas_status_cert ON public.prospeccao_linhas(status_certificacao);
CREATE INDEX IF NOT EXISTS idx_linhas_doc_hash ON public.prospeccao_linhas(user_id, doc_hash);

CREATE TABLE IF NOT EXISTS public.prospeccao_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id uuid REFERENCES public.prospeccao_linhas(id) ON DELETE CASCADE,
  job_id uuid,
  user_id uuid,
  modelo_gemini text,
  tempo_ms integer,
  documento text,
  resultado text,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prospeccao_logs TO authenticated;
GRANT ALL ON public.prospeccao_logs TO service_role;

ALTER TABLE public.prospeccao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own prospeccao logs"
  ON public.prospeccao_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_prospeccao_logs_linha ON public.prospeccao_logs(linha_id, created_at DESC);