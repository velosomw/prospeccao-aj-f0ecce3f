CREATE TABLE public.certificacao_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fase integer NOT NULL DEFAULT 1,
  modo text NOT NULL DEFAULT 'LIVE_CERTIFICATION',
  status text NOT NULL DEFAULT 'executando',
  total_processos integer NOT NULL DEFAULT 0,
  aprovados integer NOT NULL DEFAULT 0,
  reprovados integer NOT NULL DEFAULT 0,
  downloads_ok integer NOT NULL DEFAULT 0,
  ocr_ok integer NOT NULL DEFAULT 0,
  business_facts_total integer NOT NULL DEFAULT 0,
  json_validos integer NOT NULL DEFAULT 0,
  paineis_gerados integer NOT NULL DEFAULT 0,
  tempo_total_ms integer NOT NULL DEFAULT 0,
  tempo_medio_ms integer NOT NULL DEFAULT 0,
  score_medio numeric,
  consolidado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificacao_runs TO authenticated;
GRANT ALL ON public.certificacao_runs TO service_role;
ALTER TABLE public.certificacao_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own certification runs"
ON public.certificacao_runs FOR ALL TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor_ia'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor_ia'));

CREATE TABLE public.certificacao_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.certificacao_runs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ordem integer NOT NULL DEFAULT 0,
  link text,
  document_id text,
  numero_processo text,
  empresa text,
  status text NOT NULL DEFAULT 'pendente',
  aprovado boolean NOT NULL DEFAULT false,
  motivo_reprovacao text,
  download jsonb NOT NULL DEFAULT '{}'::jsonb,
  gemini jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  json_canonico jsonb NOT NULL DEFAULT '{}'::jsonb,
  painel jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  tempo_total_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificacao_processos TO authenticated;
GRANT ALL ON public.certificacao_processos TO service_role;
ALTER TABLE public.certificacao_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own certification processes"
ON public.certificacao_processos FOR ALL TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor_ia'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'gestor_ia'));

CREATE INDEX idx_cert_proc_run ON public.certificacao_processos(run_id);

CREATE TRIGGER update_certificacao_runs_updated_at
BEFORE UPDATE ON public.certificacao_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();