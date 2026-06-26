CREATE TABLE IF NOT EXISTS public.ocr_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL,
  rma_id TEXT,
  engine TEXT NOT NULL DEFAULT 'google_vision',
  raw_text TEXT,
  normalized_text TEXT,
  confidence DOUBLE PRECISION,
  structure JSONB DEFAULT '{}'::jsonb,
  page_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_document_id ON public.ocr_results(document_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_rma_id ON public.ocr_results(rma_id);

ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_ocr_results" ON public.ocr_results
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "consultor_select_ocr_results" ON public.ocr_results
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'::app_role));