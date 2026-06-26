-- ════════════════════════════════════════════════════════════════════════════
-- Agente NFe Compras Reader v1
-- Tabelas:
--   1. nfe_compras            → itens extraídos (linha = 1 NF de compra)
--   2. document_patterns      → memória de layouts por empresa+tipo (embeddings)
-- RPC:
--   match_document_pattern    → busca template similar (cosine)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. nfe_compras ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nfe_compras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id          text,
  company_id      uuid,
  extraction_id   uuid REFERENCES public.ai_extractions(id) ON DELETE SET NULL,
  document_id     uuid,

  -- Empresa (recuperanda)
  empresa         text,
  cnpj            text,

  -- Fornecedor
  fornecedor      text,
  cnpj_fornecedor text,

  -- NF
  numero_nota     text,
  serie           text,
  chave_nfe       text,
  data_emissao    date,
  data_entrada    date,

  -- Valores
  valor_total     numeric(18,2),
  valor_produtos  numeric(18,2),
  valor_frete     numeric(18,2),
  valor_desconto  numeric(18,2),
  valor_icms      numeric(18,2),
  valor_ipi       numeric(18,2),
  valor_pis       numeric(18,2),
  valor_cofins    numeric(18,2),
  valor_st        numeric(18,2),

  -- Operação
  cfop            text,
  ncm             text,
  natureza_operacao text,
  descricao       text,
  categoria       text,
  tipo            text NOT NULL DEFAULT 'compra',

  -- Origem
  origem_arquivo  text,
  linha_origem    integer,

  -- Confiança/QA
  confidence_score numeric(4,3),
  warnings        jsonb DEFAULT '[]'::jsonb,
  valid           boolean DEFAULT true,
  validated_by    uuid,
  validated_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfe_compras_rma         ON public.nfe_compras (rma_id);
CREATE INDEX IF NOT EXISTS idx_nfe_compras_company     ON public.nfe_compras (company_id);
CREATE INDEX IF NOT EXISTS idx_nfe_compras_emissao    ON public.nfe_compras (data_emissao);
CREATE INDEX IF NOT EXISTS idx_nfe_compras_fornecedor  ON public.nfe_compras (cnpj_fornecedor);
CREATE INDEX IF NOT EXISTS idx_nfe_compras_chave       ON public.nfe_compras (chave_nfe) WHERE chave_nfe IS NOT NULL;

ALTER TABLE public.nfe_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfe_compras gestor_ia all"
  ON public.nfe_compras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

CREATE POLICY "nfe_compras coordenador all"
  ON public.nfe_compras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "nfe_compras consultor read"
  ON public.nfe_compras FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'consultor'::app_role));

CREATE TRIGGER trg_nfe_compras_updated
  BEFORE UPDATE ON public.nfe_compras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. document_patterns ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_patterns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid,
  empresa_nome      text,
  tipo_documento    text NOT NULL,                     -- ex: nfe_compras
  fornecedor        text,
  layout_label      text,
  schema_detectado  jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_text       text,
  embedding         extensions.vector(768),
  hits              integer NOT NULL DEFAULT 0,
  successes         integer NOT NULL DEFAULT 0,
  confidence        numeric(4,3) DEFAULT 0.5,
  weight            numeric(3,2) NOT NULL DEFAULT 1.0,
  active            boolean NOT NULL DEFAULT true,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_patterns_tipo
  ON public.document_patterns (tipo_documento) WHERE active;
CREATE INDEX IF NOT EXISTS idx_doc_patterns_company
  ON public.document_patterns (company_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_doc_patterns_emb
  ON public.document_patterns USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.document_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_patterns gestor_ia all"
  ON public.document_patterns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

CREATE POLICY "doc_patterns coordenador all"
  ON public.document_patterns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "doc_patterns authenticated read"
  ON public.document_patterns FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_doc_patterns_updated
  BEFORE UPDATE ON public.document_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. RPC: match_document_pattern (cosine) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_document_pattern(
  query_embedding   extensions.vector,
  target_tipo       text,
  target_company_id uuid DEFAULT NULL,
  match_threshold   double precision DEFAULT 0.85,
  match_count       integer DEFAULT 3
)
RETURNS TABLE (
  id                uuid,
  layout_label      text,
  fornecedor        text,
  schema_detectado  jsonb,
  similarity        double precision,
  weight            numeric,
  confidence        numeric
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    p.id, p.layout_label, p.fornecedor, p.schema_detectado,
    1 - (p.embedding <=> query_embedding) AS similarity,
    p.weight, p.confidence
  FROM public.document_patterns p
  WHERE p.active
    AND p.tipo_documento = target_tipo
    AND p.embedding IS NOT NULL
    AND (target_company_id IS NULL OR p.company_id = target_company_id OR p.company_id IS NULL)
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY ((1 - (p.embedding <=> query_embedding)) * p.weight) DESC
  LIMIT match_count;
$$;