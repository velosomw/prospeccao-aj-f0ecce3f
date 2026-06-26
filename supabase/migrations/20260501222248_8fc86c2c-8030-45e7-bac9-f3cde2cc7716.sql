
-- Cache de parse contábil por arquivo OneDrive (Balanço + DRE extraídos pela IA)
-- Permite que rma-analyze reuse resultados quando o arquivo não mudou (etag/hash)
CREATE TABLE IF NOT EXISTS public.rma_file_parse_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id text NOT NULL,
  drive_id text,
  company_id uuid,
  rma_id text,
  ano integer,
  mes integer,
  topic_number integer,
  topic_name text,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  etag text,
  hash text,
  last_modified timestamptz,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  parser_version text NOT NULL DEFAULT 'v1',
  tipo text,
  balanco jsonb NOT NULL DEFAULT '[]'::jsonb,
  dre jsonb NOT NULL DEFAULT '[]'::jsonb,
  hits integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rma_file_parse_cache_unique UNIQUE (file_id, parser_version)
);

CREATE INDEX IF NOT EXISTS idx_rfpc_company_period ON public.rma_file_parse_cache (company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_rfpc_topic ON public.rma_file_parse_cache (company_id, topic_number);
CREATE INDEX IF NOT EXISTS idx_rfpc_etag ON public.rma_file_parse_cache (file_id, etag);

ALTER TABLE public.rma_file_parse_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam rma_file_parse_cache"
  ON public.rma_file_parse_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza rma_file_parse_cache"
  ON public.rma_file_parse_cache FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = rma_file_parse_cache.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = rma_file_parse_cache.company_id AND cc.consultant_user_id = auth.uid())
  );
