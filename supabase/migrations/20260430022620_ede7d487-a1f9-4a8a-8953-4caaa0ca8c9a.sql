
-- ============================================================
-- Prompt Builder Inteligente — Auto-Ajuste da IA RMA
-- Camada complementar (opt-in) ao ai-process atual
-- ============================================================

-- 1) Aprendizado: classificações corretas (entrada -> conta)
CREATE TABLE IF NOT EXISTS public.prompt_learning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classe TEXT NOT NULL DEFAULT 'balancete',
  entrada_texto TEXT NOT NULL,
  entrada_normalizada TEXT NOT NULL,
  classificacao_correta TEXT NOT NULL,
  conta TEXT,
  tipo TEXT,
  frequencia INTEGER NOT NULL DEFAULT 1,
  origem TEXT NOT NULL DEFAULT 'usuario', -- usuario | auto
  confianca NUMERIC NOT NULL DEFAULT 0.9,
  active BOOLEAN NOT NULL DEFAULT true,
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classe, entrada_normalizada, conta)
);

CREATE INDEX IF NOT EXISTS idx_prompt_learning_classe ON public.prompt_learning(classe) WHERE active;
CREATE INDEX IF NOT EXISTS idx_prompt_learning_freq ON public.prompt_learning(frequencia DESC) WHERE active;

ALTER TABLE public.prompt_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam prompt_learning" ON public.prompt_learning
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Autenticados leem prompt_learning ativos" ON public.prompt_learning
  FOR SELECT TO authenticated USING (active = true);

CREATE TRIGGER trg_prompt_learning_updated
  BEFORE UPDATE ON public.prompt_learning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Erros recorrentes (entram no prompt como avisos)
CREATE TABLE IF NOT EXISTS public.prompt_erros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classe TEXT NOT NULL DEFAULT 'balancete',
  erro TEXT NOT NULL,
  correcao TEXT NOT NULL,
  frequencia INTEGER NOT NULL DEFAULT 1,
  impacto TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  active BOOLEAN NOT NULL DEFAULT true,
  promoted_to_rule BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_erros_classe ON public.prompt_erros(classe, impacto, frequencia DESC) WHERE active;

ALTER TABLE public.prompt_erros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam prompt_erros" ON public.prompt_erros
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Autenticados leem prompt_erros ativos" ON public.prompt_erros
  FOR SELECT TO authenticated USING (active = true);

CREATE TRIGGER trg_prompt_erros_updated
  BEFORE UPDATE ON public.prompt_erros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Versionamento e debug do prompt construído
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classe TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  document_id UUID,
  rma_id TEXT,
  company_id UUID,
  prompt_final TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '{}'::jsonb, -- { base, contexto, regras, erros, exemplos }
  prompt_hash TEXT NOT NULL,
  tokens_estimated INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_classe ON public.prompt_versions(classe, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_hash ON public.prompt_versions(prompt_hash);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam prompt_versions" ON public.prompt_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));
