
-- Evidências por seção
CREATE TABLE IF NOT EXISTS public.rma_section_evidences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.rma_document_sections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.rma_documents(id) ON DELETE CASCADE,
  claim_text TEXT,
  source_type TEXT NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  doc_url TEXT,
  page INTEGER,
  confidence NUMERIC,
  hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rma_section_evidences_section_idx ON public.rma_section_evidences(section_id);
CREATE INDEX IF NOT EXISTS rma_section_evidences_document_idx ON public.rma_section_evidences(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rma_section_evidences TO authenticated;
GRANT ALL ON public.rma_section_evidences TO service_role;
ALTER TABLE public.rma_section_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read evidences"
  ON public.rma_section_evidences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write evidences"
  ON public.rma_section_evidences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update evidences"
  ON public.rma_section_evidences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete evidences"
  ON public.rma_section_evidences FOR DELETE TO authenticated USING (true);

-- Colunas estruturadas em rma_document_sections (5-blocos)
ALTER TABLE public.rma_document_sections
  ADD COLUMN IF NOT EXISTS dados_extraidos JSONB,
  ADD COLUMN IF NOT EXISTS validacao JSONB,
  ADD COLUMN IF NOT EXISTS analise_ia TEXT,
  ADD COLUMN IF NOT EXISTS conclusao_ia JSONB,
  ADD COLUMN IF NOT EXISTS risco TEXT,
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC;

-- Indicadores globais em rma_documents
ALTER TABLE public.rma_documents
  ADD COLUMN IF NOT EXISTS executive_summary JSONB,
  ADD COLUMN IF NOT EXISTS health_score NUMERIC,
  ADD COLUMN IF NOT EXISTS risk_global TEXT;
