
-- 1) Tabela de rastreabilidade de fontes por seção
CREATE TABLE IF NOT EXISTS public.rma_section_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.rma_document_sections(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.rma_documents(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN (
    'balancete','balancete_consolidado','fluxo_caixa','dre','documento',
    'period_analysis','chart','memoria_empresa','outro'
  )),
  source_table text,
  source_id uuid,
  company_id uuid,
  ano integer,
  mes integer,
  periodo_label text,
  trecho text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_section_sources_section ON public.rma_section_data_sources(section_id);
CREATE INDEX IF NOT EXISTS idx_rma_section_sources_document ON public.rma_section_data_sources(document_id);
CREATE INDEX IF NOT EXISTS idx_rma_section_sources_type ON public.rma_section_data_sources(source_type);

ALTER TABLE public.rma_section_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sources visibility follows document"
  ON public.rma_section_data_sources
  FOR SELECT
  USING (public.can_access_rma_doc(document_id));

CREATE POLICY "Coordenador/Gestor manage sources"
  ON public.rma_section_data_sources
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  );

-- 2) Governança nas seções
ALTER TABLE public.rma_document_sections
  ADD COLUMN IF NOT EXISTS grounding_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ungrounded_claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS regen_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.rma_document_sections
  DROP CONSTRAINT IF EXISTS rma_document_sections_grounding_chk;
ALTER TABLE public.rma_document_sections
  ADD CONSTRAINT rma_document_sections_grounding_chk
  CHECK (grounding_score BETWEEN 0 AND 100);
