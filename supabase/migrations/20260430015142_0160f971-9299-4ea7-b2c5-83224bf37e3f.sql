-- ============================================================
-- Pipeline Balancete RMA — Fase 1: Fundação de dados
-- ============================================================

-- 1) Plano de contas por empresa (hierárquico)
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  conta text NOT NULL,                    -- ex: "1110100001"
  descricao text NOT NULL,                -- ex: "CAIXA MATRIZ"
  nivel int NOT NULL,                     -- 1..N (1=sintética topo)
  parent_conta text,                      -- FK lógica para conta pai (mesmo company_id)
  tipo text NOT NULL,                     -- ativo|passivo|pl|receita|despesa
  natureza text,                          -- circulante|nao_circulante|operacional|...
  is_analytical boolean NOT NULL DEFAULT false, -- folha da árvore (recebe lançamento)
  ordem int,                              -- preserva ordem do Excel
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'excel_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, conta)
);
CREATE INDEX idx_coa_company ON public.chart_of_accounts(company_id);
CREATE INDEX idx_coa_parent ON public.chart_of_accounts(company_id, parent_conta);
CREATE INDEX idx_coa_tipo ON public.chart_of_accounts(company_id, tipo);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam chart_of_accounts"
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'))
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'));

CREATE POLICY "Consultor visualiza chart_of_accounts"
  ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor')
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = chart_of_accounts.company_id AND c.created_by = auth.uid())
  );

CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Lançamentos extraídos (linha-base do balancete, com auditoria)
CREATE TABLE public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria text NOT NULL,                -- dre|fluxo_caixa|extrato|estoque|imobilizado|folha|impostos|fornecedores|endividamento
  descricao_original text NOT NULL,       -- como veio do OCR
  descricao_padronizada text,             -- após normalização IA
  conta text,                             -- conta mapeada (FK lógica para chart_of_accounts.conta)
  valor numeric(18,2) NOT NULL DEFAULT 0,
  tipo_lancamento text,                   -- receita|despesa|ativo|passivo|pl
  data_documento date,
  -- Auditoria / origem
  document_id uuid,
  extraction_id uuid,                     -- FK lógica → ai_extractions.id
  pagina int,
  linha int,
  origem_arquivo text,                    -- nome do arquivo OneDrive
  -- Confiança
  confianca_ocr numeric(4,3),
  confianca_ia numeric(4,3),
  confianca_mapeamento numeric(4,3),
  status text NOT NULL DEFAULT 'pending', -- pending|mapped|reviewed|rejected
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lanc_company_periodo ON public.lancamentos(company_id, ano, mes);
CREATE INDEX idx_lanc_conta ON public.lancamentos(company_id, conta);
CREATE INDEX idx_lanc_status ON public.lancamentos(status);
CREATE INDEX idx_lanc_categoria ON public.lancamentos(company_id, categoria);

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam lancamentos"
  ON public.lancamentos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'))
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'));

CREATE POLICY "Consultor/owner visualiza lancamentos"
  ON public.lancamentos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor')
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = lancamentos.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = lancamentos.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER trg_lanc_updated BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Balancete consolidado (snapshot agregado conta x mês)
CREATE TABLE public.balancete_consolidado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  conta text NOT NULL,
  descricao text NOT NULL,
  nivel int NOT NULL,
  tipo text NOT NULL,
  valor numeric(18,2) NOT NULL DEFAULT 0,
  qtd_lancamentos int NOT NULL DEFAULT 0,
  origem_lancamento_ids uuid[] DEFAULT '{}',
  reconciled boolean NOT NULL DEFAULT false,
  reconciliation_notes jsonb,
  run_id uuid,                            -- FK lógica → balancete_runs.id
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ano, mes, conta)
);
CREATE INDEX idx_bal_company_periodo ON public.balancete_consolidado(company_id, ano, mes);
CREATE INDEX idx_bal_run ON public.balancete_consolidado(run_id);

ALTER TABLE public.balancete_consolidado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam balancete_consolidado"
  ON public.balancete_consolidado FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'))
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'));

CREATE POLICY "Consultor/owner visualiza balancete_consolidado"
  ON public.balancete_consolidado FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor')
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_consolidado.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_consolidado.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER trg_bal_updated BEFORE UPDATE ON public.balancete_consolidado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Jobs de construção do balancete (status, métricas, custos)
CREATE TABLE public.balancete_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'pending',  -- pending|listing|ocr|extracting|mapping|consolidating|reconciling|completed|failed|canceled
  progress int NOT NULL DEFAULT 0,
  folders_total int DEFAULT 0,
  folders_processed int DEFAULT 0,
  files_total int DEFAULT 0,
  files_processed int DEFAULT 0,
  files_skipped int DEFAULT 0,
  lancamentos_criados int DEFAULT 0,
  reconciliation_passed boolean,
  reconciliation_report jsonb,
  alerts jsonb DEFAULT '[]'::jsonb,
  cost_total numeric(10,4) DEFAULT 0,
  duration_ms int,
  error_message text,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_brun_company_periodo ON public.balancete_runs(company_id, ano, mes);
CREATE INDEX idx_brun_status ON public.balancete_runs(status);

ALTER TABLE public.balancete_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam balancete_runs"
  ON public.balancete_runs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'))
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'));

CREATE POLICY "Consultor/owner visualiza balancete_runs"
  ON public.balancete_runs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'consultor')
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = balancete_runs.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = balancete_runs.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER trg_brun_updated BEFORE UPDATE ON public.balancete_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Cache de mapeamento (descrição OCR → conta) — alimenta aprendizado
CREATE TABLE public.account_mapping_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  descricao_normalizada text NOT NULL,    -- chave de busca (lowercase, sem acento)
  conta text NOT NULL,
  descricao_padronizada text NOT NULL,
  hits int NOT NULL DEFAULT 1,
  confianca numeric(4,3) NOT NULL DEFAULT 0.8,
  source text NOT NULL DEFAULT 'ai',      -- ai|human_correction
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, descricao_normalizada)
);
CREATE INDEX idx_amap_lookup ON public.account_mapping_cache(company_id, descricao_normalizada);

ALTER TABLE public.account_mapping_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam account_mapping_cache"
  ON public.account_mapping_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'))
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenador'));

CREATE POLICY "Autenticados leem account_mapping_cache"
  ON public.account_mapping_cache FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_amap_updated BEFORE UPDATE ON public.account_mapping_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
