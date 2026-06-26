
-- =========================================================
-- FASE 1: SCHEMA BALANCETE V2 (idempotente)
-- =========================================================

-- 1) chart_of_accounts: estruturação contábil
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS subgrupo text;

CREATE INDEX IF NOT EXISTS idx_coa_codigo ON public.chart_of_accounts(codigo);
CREATE INDEX IF NOT EXISTS idx_coa_grupo ON public.chart_of_accounts(grupo);

-- 2) lancamentos: débito / crédito / saldo + estruturação
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS debito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS subgrupo text;

CREATE INDEX IF NOT EXISTS idx_lanc_codigo ON public.lancamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_lanc_grupo ON public.lancamentos(grupo);

-- 3) balancete_consolidado: débito / crédito / saldo + confiança
ALTER TABLE public.balancete_consolidado
  ADD COLUMN IF NOT EXISTS debito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS subgrupo text,
  ADD COLUMN IF NOT EXISTS confianca_global numeric;

CREATE INDEX IF NOT EXISTS idx_bc_codigo ON public.balancete_consolidado(codigo);
CREATE INDEX IF NOT EXISTS idx_bc_grupo ON public.balancete_consolidado(grupo);
CREATE INDEX IF NOT EXISTS idx_bc_company_period ON public.balancete_consolidado(company_id, ano, mes);

-- 4) dre_consolidado
CREATE TABLE IF NOT EXISTS public.dre_consolidado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL,
  run_id uuid,
  codigo text,
  grupo text NOT NULL,             -- receita_bruta, deducoes, custos, despesas_op, resultado_financeiro, ir_csll, resultado_liquido
  subgrupo text,
  conta text NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL,              -- receita | despesa | resultado
  nivel integer NOT NULL DEFAULT 1,
  valor numeric NOT NULL DEFAULT 0,
  debito numeric NOT NULL DEFAULT 0,
  credito numeric NOT NULL DEFAULT 0,
  saldo numeric NOT NULL DEFAULT 0,
  qtd_lancamentos integer NOT NULL DEFAULT 0,
  origem_lancamento_ids uuid[] DEFAULT '{}'::uuid[],
  confianca_global numeric,
  reconciled boolean NOT NULL DEFAULT false,
  reconciliation_notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dre_company_period ON public.dre_consolidado(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_dre_grupo ON public.dre_consolidado(grupo);

ALTER TABLE public.dre_consolidado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam dre_consolidado" ON public.dre_consolidado;
CREATE POLICY "Admins gerenciam dre_consolidado"
  ON public.dre_consolidado
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza dre_consolidado" ON public.dre_consolidado;
CREATE POLICY "Consultor/owner visualiza dre_consolidado"
  ON public.dre_consolidado
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = dre_consolidado.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = dre_consolidado.company_id AND cc.consultant_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_dre_updated ON public.dre_consolidado;
CREATE TRIGGER trg_dre_updated BEFORE UPDATE ON public.dre_consolidado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) fluxo_caixa_consolidado
CREATE TABLE IF NOT EXISTS public.fluxo_caixa_consolidado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL,
  run_id uuid,
  categoria text NOT NULL,         -- operacional | investimento | financiamento | saldo_inicial | saldo_final
  subcategoria text,
  descricao text NOT NULL,
  tipo text NOT NULL,              -- entrada | saida | saldo
  valor numeric NOT NULL DEFAULT 0,
  entradas numeric NOT NULL DEFAULT 0,
  saidas numeric NOT NULL DEFAULT 0,
  saldo numeric NOT NULL DEFAULT 0,
  qtd_lancamentos integer NOT NULL DEFAULT 0,
  origem_lancamento_ids uuid[] DEFAULT '{}'::uuid[],
  confianca_global numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fcx_company_period ON public.fluxo_caixa_consolidado(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_fcx_categoria ON public.fluxo_caixa_consolidado(categoria);

ALTER TABLE public.fluxo_caixa_consolidado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam fluxo_caixa" ON public.fluxo_caixa_consolidado;
CREATE POLICY "Admins gerenciam fluxo_caixa"
  ON public.fluxo_caixa_consolidado
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza fluxo_caixa" ON public.fluxo_caixa_consolidado;
CREATE POLICY "Consultor/owner visualiza fluxo_caixa"
  ON public.fluxo_caixa_consolidado
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = fluxo_caixa_consolidado.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = fluxo_caixa_consolidado.company_id AND cc.consultant_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_fcx_updated ON public.fluxo_caixa_consolidado;
CREATE TRIGGER trg_fcx_updated BEFORE UPDATE ON public.fluxo_caixa_consolidado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) balancete_validacoes (reconciliação + confiança + alertas)
CREATE TABLE IF NOT EXISTS public.balancete_validacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  run_id uuid,
  ano integer NOT NULL,
  mes integer NOT NULL,
  ativo_total numeric NOT NULL DEFAULT 0,
  passivo_total numeric NOT NULL DEFAULT 0,
  pl_total numeric NOT NULL DEFAULT 0,
  diferenca numeric NOT NULL DEFAULT 0,
  reconciled boolean NOT NULL DEFAULT false,
  confianca_global numeric,
  alertas jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bval_company_period ON public.balancete_validacoes(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_bval_run ON public.balancete_validacoes(run_id);

ALTER TABLE public.balancete_validacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam balancete_validacoes" ON public.balancete_validacoes;
CREATE POLICY "Admins gerenciam balancete_validacoes"
  ON public.balancete_validacoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner visualiza balancete_validacoes" ON public.balancete_validacoes;
CREATE POLICY "Consultor/owner visualiza balancete_validacoes"
  ON public.balancete_validacoes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_validacoes.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_validacoes.company_id AND cc.consultant_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_bval_updated ON public.balancete_validacoes;
CREATE TRIGGER trg_bval_updated BEFORE UPDATE ON public.balancete_validacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- BACKFILL idempotente: deriva débito/crédito/saldo de 'valor'
-- =========================================================

UPDATE public.lancamentos
SET
  saldo = COALESCE(NULLIF(saldo,0), valor),
  debito = CASE WHEN debito = 0 AND valor >= 0 THEN valor ELSE debito END,
  credito = CASE WHEN credito = 0 AND valor < 0 THEN ABS(valor) ELSE credito END
WHERE (saldo = 0 OR debito = 0 OR credito = 0)
  AND valor <> 0;

UPDATE public.balancete_consolidado
SET
  saldo = COALESCE(NULLIF(saldo,0), valor),
  debito = CASE WHEN debito = 0 AND valor >= 0 THEN valor ELSE debito END,
  credito = CASE WHEN credito = 0 AND valor < 0 THEN ABS(valor) ELSE credito END
WHERE (saldo = 0 OR debito = 0 OR credito = 0)
  AND valor <> 0;
