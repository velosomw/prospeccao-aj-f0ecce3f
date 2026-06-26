
-- =========================================================
-- FASE 3-A: PERSISTÊNCIA EVOLUTIVA (schema)
-- =========================================================

-- 1) lancamentos: chave de merge + proteção contra delete
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS merge_key text,
  ADD COLUMN IF NOT EXISTS protected boolean NOT NULL DEFAULT true;

-- merge_key: hash determinístico (document_id + linha + conta + valor)
CREATE INDEX IF NOT EXISTS idx_lanc_merge_key ON public.lancamentos(merge_key);

-- Backfill do merge_key para registros existentes
UPDATE public.lancamentos
SET merge_key = encode(
  digest(
    COALESCE(document_id::text,'-') || '|' ||
    COALESCE(linha::text,'-') || '|' ||
    COALESCE(conta,'-') || '|' ||
    COALESCE(valor::text,'-'),
    'sha256'
  ),
  'hex'
)
WHERE merge_key IS NULL;

-- 2) balancete_versions — histórico imutável
CREATE TABLE IF NOT EXISTS public.balancete_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL,
  conta text NOT NULL,
  versao integer NOT NULL,            -- v1, v2, v3 da mesma conta no mesmo período
  run_id uuid,                        -- balancete_runs que gerou
  origem_arquivo text,                -- file_name do documento
  document_id uuid,
  valor numeric NOT NULL DEFAULT 0,
  debito numeric NOT NULL DEFAULT 0,
  credito numeric NOT NULL DEFAULT 0,
  saldo numeric NOT NULL DEFAULT 0,
  confianca numeric,
  delta_valor numeric NOT NULL DEFAULT 0,  -- quanto mudou em relação à versão anterior
  acao text NOT NULL DEFAULT 'incremento',  -- incremento | criacao | conflito | validacao
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bver_period ON public.balancete_versions(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_bver_conta ON public.balancete_versions(company_id, ano, mes, conta);
CREATE INDEX IF NOT EXISTS idx_bver_run ON public.balancete_versions(run_id);

ALTER TABLE public.balancete_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam balancete_versions" ON public.balancete_versions;
CREATE POLICY "Admins gerenciam balancete_versions"
  ON public.balancete_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza balancete_versions" ON public.balancete_versions;
CREATE POLICY "Consultor/owner visualiza balancete_versions"
  ON public.balancete_versions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_versions.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_versions.company_id AND cc.consultant_user_id = auth.uid())
  );

-- 3) balancete_conflicts — divergências entre documentos
CREATE TABLE IF NOT EXISTS public.balancete_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL,
  conta text NOT NULL,
  descricao text,
  valores jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{valor, confianca, origem_arquivo, document_id}]
  valor_vencedor numeric,                       -- valor escolhido (maior confiança)
  confianca_vencedor numeric,
  origem_vencedor text,
  diferenca_max numeric NOT NULL DEFAULT 0,    -- diff entre maior e menor valor
  status text NOT NULL DEFAULT 'pendente',     -- pendente | resolvido | ignorado
  resolution_action text,                       -- maior_confianca | media_ponderada | manual
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ano, mes, conta)
);

CREATE INDEX IF NOT EXISTS idx_bconf_period ON public.balancete_conflicts(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_bconf_status ON public.balancete_conflicts(status);

ALTER TABLE public.balancete_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam balancete_conflicts" ON public.balancete_conflicts;
CREATE POLICY "Admins gerenciam balancete_conflicts"
  ON public.balancete_conflicts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza balancete_conflicts" ON public.balancete_conflicts;
CREATE POLICY "Consultor/owner visualiza balancete_conflicts"
  ON public.balancete_conflicts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_conflicts.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_conflicts.company_id AND cc.consultant_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_bconf_updated ON public.balancete_conflicts;
CREATE TRIGGER trg_bconf_updated BEFORE UPDATE ON public.balancete_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) balancete_periods — status do período
CREATE TABLE IF NOT EXISTS public.balancete_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL,
  status text NOT NULL DEFAULT 'parcial',   -- parcial | completo | em_validacao
  total_documentos integer NOT NULL DEFAULT 0,
  total_lancamentos integer NOT NULL DEFAULT 0,
  total_contas integer NOT NULL DEFAULT 0,
  conflitos_pendentes integer NOT NULL DEFAULT 0,
  confianca_media numeric,
  ultima_carga_at timestamptz,
  ultimo_run_id uuid,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{at, run_id, docs, lanc, status}]
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_bper_company ON public.balancete_periods(company_id);

ALTER TABLE public.balancete_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam balancete_periods" ON public.balancete_periods;
CREATE POLICY "Admins gerenciam balancete_periods"
  ON public.balancete_periods
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza balancete_periods" ON public.balancete_periods;
CREATE POLICY "Consultor/owner visualiza balancete_periods"
  ON public.balancete_periods
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_periods.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_periods.company_id AND cc.consultant_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_bper_updated ON public.balancete_periods;
CREATE TRIGGER trg_bper_updated BEFORE UPDATE ON public.balancete_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
