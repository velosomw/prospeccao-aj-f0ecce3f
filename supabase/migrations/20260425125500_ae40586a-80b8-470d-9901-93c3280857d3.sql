
CREATE TABLE IF NOT EXISTS public.ai_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  rma_id TEXT,
  path TEXT,
  classe TEXT,
  agent TEXT,
  raw_text TEXT,
  normalized_text TEXT,
  ocr_confidence NUMERIC,
  ai_confidence NUMERIC,
  final_confidence NUMERIC,
  extracted_data JSONB,
  validation JSONB,
  valid BOOLEAN DEFAULT false,
  corrections JSONB,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  duration_ms INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_extractions_document ON public.ai_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_rma ON public.ai_extractions(rma_id);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_classe ON public.ai_extractions(classe);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_status ON public.ai_extractions(status);

ALTER TABLE public.ai_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam ai_extractions"
ON public.ai_extractions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'))
WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'));

CREATE POLICY "Consultor visualiza ai_extractions"
ON public.ai_extractions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'consultor'));

CREATE POLICY "Magistrado/Recuperanda visualizam ai_extractions atribuidas"
ON public.ai_extractions
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'magistrado') OR public.has_role(auth.uid(), 'recuperanda'))
  AND EXISTS (
    SELECT 1 FROM public.rma_release_assignments r
    WHERE r.released_to_user_id = auth.uid()
      AND r.status = 'active'
  )
);

CREATE TRIGGER update_ai_extractions_updated_at
BEFORE UPDATE ON public.ai_extractions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
