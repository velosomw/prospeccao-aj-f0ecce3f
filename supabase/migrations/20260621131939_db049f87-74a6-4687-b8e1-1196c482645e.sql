
-- 1) Métricas de qualidade no agent_profiles
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 0.5 NOT NULL,
  ADD COLUMN IF NOT EXISTS validation_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz;

-- 2) View de docs elegíveis para treinamento
CREATE OR REPLACE VIEW public.vw_training_pending AS
SELECT
  e.id              AS extraction_id,
  e.document_id,
  e.rma_id,
  e.path,
  e.classe,
  e.agent,
  e.final_confidence,
  e.status,
  e.extracted_data,
  e.normalized_text,
  e.created_at,
  pd.file_name,
  pd.mime_type
FROM public.ai_extractions e
LEFT JOIN public.pipeline_documents pd ON pd.id = e.document_id
WHERE
  (e.final_confidence IS NULL OR e.final_confidence < 0.85)
  OR e.status IN ('error','needs_review','failed')
ORDER BY e.created_at DESC;

GRANT SELECT ON public.vw_training_pending TO authenticated;
GRANT ALL ON public.vw_training_pending TO service_role;
