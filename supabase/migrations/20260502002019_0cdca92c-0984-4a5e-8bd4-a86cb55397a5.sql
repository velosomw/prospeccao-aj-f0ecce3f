-- 1) Telemetria de uso por exemplo
ALTER TABLE public.prompt_examples
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prompt_examples_usage
  ON public.prompt_examples (usage_count DESC, success_count DESC);

-- 2) Ajuste dinâmico de peso (success +0.1, failure -0.2; clamp [0.1, 5.0])
CREATE OR REPLACE FUNCTION public.update_prompt_example_weight(
  example_id uuid,
  success boolean
)
RETURNS TABLE(id uuid, weight numeric, usage_count integer, success_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta numeric := CASE WHEN success THEN 0.1 ELSE -0.2 END;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
          OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  RETURN QUERY
  UPDATE public.prompt_examples pe
     SET weight        = LEAST(5.0, GREATEST(0.1, pe.weight + delta)),
         usage_count   = pe.usage_count + 1,
         success_count = pe.success_count + CASE WHEN success THEN 1 ELSE 0 END,
         last_used_at  = now()
   WHERE pe.id = example_id
  RETURNING pe.id, pe.weight, pe.usage_count, pe.success_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_prompt_example_weight(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_prompt_example_weight(uuid, boolean) TO authenticated;

-- 3) Aprendizado: registra novo exemplo validado com peso boost
CREATE OR REPLACE FUNCTION public.learn_prompt_example(
  p_classe text,
  p_input_text text,
  p_output_json jsonb,
  p_validated_id uuid DEFAULT NULL,
  p_agent text DEFAULT NULL,
  p_weight numeric DEFAULT 1.2
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
          OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF p_classe IS NULL OR length(trim(p_classe)) = 0 THEN
    RAISE EXCEPTION 'classe é obrigatória';
  END IF;
  IF p_input_text IS NULL OR length(trim(p_input_text)) = 0 THEN
    RAISE EXCEPTION 'input_text é obrigatório';
  END IF;

  INSERT INTO public.prompt_examples (
    validated_id, classe, agent, input_text, output_json, weight, active
  ) VALUES (
    p_validated_id, p_classe, p_agent, p_input_text, COALESCE(p_output_json, '{}'::jsonb),
    LEAST(5.0, GREATEST(0.1, p_weight)), true
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.learn_prompt_example(text, text, jsonb, uuid, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.learn_prompt_example(text, text, jsonb, uuid, text, numeric) TO authenticated;