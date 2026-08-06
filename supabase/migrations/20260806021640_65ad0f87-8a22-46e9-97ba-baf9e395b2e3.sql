
CREATE OR REPLACE FUNCTION public.knowledge_upsert_entity(
  p_tipo text,
  p_chave text,
  p_nome text,
  p_dados jsonb DEFAULT '{}'::jsonb,
  p_origem jsonb DEFAULT '{}'::jsonb,
  p_uf text DEFAULT NULL,
  p_municipio text DEFAULT NULL,
  p_tribunal text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_confiabilidade numeric DEFAULT NULL,
  p_projeto text DEFAULT 'orange_ai'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.knowledge_entities%ROWTYPE;
  merged jsonb;
  diffs jsonb := '{}'::jsonb;
  k text;
  new_version integer;
BEGIN
  IF p_tipo IS NULL OR p_chave IS NULL OR length(trim(p_chave)) = 0 THEN
    RAISE EXCEPTION 'tipo e chave_natural são obrigatórios';
  END IF;

  SELECT * INTO e FROM public.knowledge_entities
   WHERE tipo = p_tipo AND chave_natural = p_chave FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.knowledge_entities (
      tipo, chave_natural, nome, nome_normalizado, projeto, dados,
      versao, update_count, confiabilidade, situacao, uf, municipio, tribunal
    ) VALUES (
      p_tipo, p_chave, COALESCE(p_nome, p_chave), lower(COALESCE(p_nome, p_chave)),
      COALESCE(p_projeto,'orange_ai'), COALESCE(p_dados,'{}'::jsonb),
      1, 0, p_confiabilidade, p_situacao, p_uf, p_municipio, p_tribunal
    ) RETURNING * INTO e;

    INSERT INTO public.knowledge_entity_versions (entity_id, versao, dados, mudancas, origem)
    VALUES (e.id, 1, e.dados, '{"_created": true}'::jsonb, COALESCE(p_origem,'{}'::jsonb));
  ELSE
    merged := e.dados || COALESCE(p_dados, '{}'::jsonb);

    FOR k IN SELECT jsonb_object_keys(COALESCE(p_dados,'{}'::jsonb)) LOOP
      IF (e.dados -> k) IS DISTINCT FROM (p_dados -> k) THEN
        diffs := diffs || jsonb_build_object(k, jsonb_build_object('de', e.dados -> k, 'para', p_dados -> k));
      END IF;
    END LOOP;

    IF diffs = '{}'::jsonb THEN
      UPDATE public.knowledge_entities SET ultima_atualizacao = now() WHERE id = e.id;
      RETURN e.id;
    END IF;

    new_version := e.versao + 1;

    UPDATE public.knowledge_entities
       SET dados = merged,
           nome = COALESCE(NULLIF(trim(p_nome),''), nome),
           nome_normalizado = lower(COALESCE(NULLIF(trim(p_nome),''), nome)),
           versao = new_version,
           update_count = update_count + 1,
           confiabilidade = COALESCE(p_confiabilidade, confiabilidade),
           situacao = COALESCE(p_situacao, situacao),
           uf = COALESCE(p_uf, uf),
           municipio = COALESCE(p_municipio, municipio),
           tribunal = COALESCE(p_tribunal, tribunal),
           ultima_atualizacao = now()
     WHERE id = e.id;

    INSERT INTO public.knowledge_entity_versions (entity_id, versao, dados, mudancas, origem)
    VALUES (e.id, new_version, merged, diffs, COALESCE(p_origem,'{}'::jsonb));
  END IF;

  IF p_origem IS NOT NULL AND p_origem <> '{}'::jsonb THEN
    INSERT INTO public.knowledge_sources (
      entity_id, versao, document_id, registry_id, business_fact,
      hash_sha256, motor_ia, confiabilidade, user_id
    ) VALUES (
      e.id,
      COALESCE((SELECT versao FROM public.knowledge_entities WHERE id = e.id), 1),
      p_origem ->> 'document_id',
      NULLIF(p_origem ->> 'registry_id','')::uuid,
      COALESCE(p_origem -> 'business_fact','{}'::jsonb),
      p_origem ->> 'hash_sha256',
      p_origem ->> 'motor_ia',
      NULLIF(p_origem ->> 'confiabilidade','')::numeric,
      NULLIF(p_origem ->> 'user_id','')::uuid
    );
  END IF;

  RETURN e.id;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_upsert_entity(text,text,text,jsonb,jsonb,text,text,text,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_upsert_entity(text,text,text,jsonb,jsonb,text,text,text,text,numeric,text) TO service_role;
