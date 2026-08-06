-- 1) RLS em public.letters
ALTER TABLE public.letters ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.letters TO authenticated;
GRANT ALL ON public.letters TO service_role;
CREATE POLICY "letters_select_authenticated" ON public.letters FOR SELECT TO authenticated USING (true);
CREATE POLICY "letters_insert_authenticated" ON public.letters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "letters_update_authenticated" ON public.letters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "letters_delete_staff" ON public.letters FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador') OR public.has_role(auth.uid(), 'consultor'));

-- 2) Tabela canônica de Business Facts (EAV tipado)
CREATE TABLE public.prospeccao_business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id uuid REFERENCES public.prospeccao_linhas(id) ON DELETE CASCADE,
  workspace_id uuid,
  document_id text,
  numero_processo text,
  cnpj text,
  fact_key text NOT NULL,
  fact_type text NOT NULL DEFAULT 'text',
  value_text text,
  value_numeric numeric,
  value_date date,
  value_json jsonb,
  unit text,
  confidence numeric,
  source text,
  evidence_snippet text,
  schema_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pbf_linha ON public.prospeccao_business_facts(linha_id);
CREATE INDEX idx_pbf_doc ON public.prospeccao_business_facts(document_id);
CREATE INDEX idx_pbf_key ON public.prospeccao_business_facts(fact_key);
CREATE INDEX idx_pbf_processo ON public.prospeccao_business_facts(numero_processo);
GRANT SELECT ON public.prospeccao_business_facts TO authenticated;
GRANT ALL ON public.prospeccao_business_facts TO service_role;
ALTER TABLE public.prospeccao_business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pbf_read_authenticated" ON public.prospeccao_business_facts FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_pbf_updated_at BEFORE UPDATE ON public.prospeccao_business_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Telemetria de performance por etapa
CREATE TABLE public.processing_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  linha_id uuid,
  document_id text,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  duration_ms integer,
  bytes integer,
  pages integer,
  tokens_input integer,
  tokens_output integer,
  model text,
  provider text,
  cost_usd numeric,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptel_run ON public.processing_telemetry(run_id);
CREATE INDEX idx_ptel_stage ON public.processing_telemetry(stage, created_at DESC);
GRANT SELECT ON public.processing_telemetry TO authenticated;
GRANT ALL ON public.processing_telemetry TO service_role;
ALTER TABLE public.processing_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ptel_read_authenticated" ON public.processing_telemetry FOR SELECT TO authenticated USING (true);