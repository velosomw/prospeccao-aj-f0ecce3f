-- 1) Bucket público para documentos de aprendizado (preview no viewer)
INSERT INTO storage.buckets (id, name, public)
VALUES ('learning-docs', 'learning-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket
CREATE POLICY "Admins gerenciam learning-docs"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'learning-docs' AND (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador')))
WITH CHECK (bucket_id = 'learning-docs' AND (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador')));

CREATE POLICY "Public read learning-docs"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'learning-docs');

-- 2) Tabela de feedback campo-a-campo (treino fino)
CREATE TABLE IF NOT EXISTS public.dataset_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  extraction_id uuid REFERENCES public.ai_extractions(id) ON DELETE SET NULL,
  validated_id uuid REFERENCES public.dataset_validated(id) ON DELETE SET NULL,
  classe text,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dataset_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam dataset_feedback"
ON public.dataset_feedback FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'))
WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'));

CREATE INDEX IF NOT EXISTS dataset_feedback_extraction_idx ON public.dataset_feedback(extraction_id);
CREATE INDEX IF NOT EXISTS dataset_feedback_classe_idx ON public.dataset_feedback(classe);

-- 3) Marcar extrações criadas via tela de aprendizado (origem manual)
ALTER TABLE public.ai_extractions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pipeline';
-- valores: 'pipeline' (RMA real) | 'learning' (upload manual de treino)

CREATE INDEX IF NOT EXISTS ai_extractions_source_idx ON public.ai_extractions(source);