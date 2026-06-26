-- Variante de search_prompt_examples com filtro opcional por path/agente.
-- Usada pelo Prompt Builder Inteligente para "boost por pasta": exemplos
-- validados oriundos da mesma pasta tendem a refletir o mesmo subdomínio.
-- Nota: prompt_examples não tem coluna path; juntamos com dataset_validated
-- via validated_id para acessar dataset_validated.path.

CREATE OR REPLACE FUNCTION public.search_prompt_examples_by_path(
  query_embedding extensions.vector,
  target_classe text,
  target_path text DEFAULT NULL,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 3
)
RETURNS TABLE(
  id uuid,
  input_text text,
  output_json jsonb,
  similarity double precision,
  weight numeric,
  path text
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    pe.id,
    pe.input_text,
    pe.output_json,
    1 - (pe.embedding <=> query_embedding) AS similarity,
    pe.weight,
    dv.path
  FROM public.prompt_examples pe
  LEFT JOIN public.dataset_validated dv ON dv.id = pe.validated_id
  WHERE pe.active = true
    AND pe.classe = target_classe
    AND pe.embedding IS NOT NULL
    AND 1 - (pe.embedding <=> query_embedding) > match_threshold
    AND (
      target_path IS NULL
      OR dv.path = target_path
      OR dv.path ILIKE target_path || '%'
    )
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;