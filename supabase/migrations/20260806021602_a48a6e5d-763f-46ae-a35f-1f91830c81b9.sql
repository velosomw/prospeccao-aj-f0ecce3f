
-- ============ MD-ENTERPRISE-KNOWLEDGE-REGISTRY-001 ============

CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,                    -- empresa|pessoa_aj|pessoa_magistrado|pessoa_advogado|credor|recuperanda|grupo_economico|processo|comarca|vara|tribunal|documento
  chave_natural text NOT NULL,           -- CNPJ, CPF, nº CNJ, slug normalizado
  nome text NOT NULL,
  nome_normalizado text,
  projeto text NOT NULL DEFAULT 'orange_ai',
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  update_count integer NOT NULL DEFAULT 0,
  confiabilidade numeric,
  situacao text,
  uf text,
  municipio text,
  tribunal text,
  primeira_aparicao timestamptz NOT NULL DEFAULT now(),
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave_natural)
);
GRANT SELECT ON public.knowledge_entities TO authenticated;
GRANT ALL ON public.knowledge_entities TO service_role;
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_entities_read" ON public.knowledge_entities
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ke_tipo ON public.knowledge_entities(tipo);
CREATE INDEX IF NOT EXISTS idx_ke_nome ON public.knowledge_entities(nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_ke_uf ON public.knowledge_entities(uf);
CREATE INDEX IF NOT EXISTS idx_ke_dados ON public.knowledge_entities USING gin (dados);

-- Histórico imutável de versões
CREATE TABLE IF NOT EXISTS public.knowledge_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  dados jsonb NOT NULL,
  mudancas jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, versao)
);
GRANT SELECT ON public.knowledge_entity_versions TO authenticated;
GRANT ALL ON public.knowledge_entity_versions TO service_role;
ALTER TABLE public.knowledge_entity_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_versions_read" ON public.knowledge_entity_versions
  FOR SELECT TO authenticated USING (true);

-- Relacionamentos
CREATE TABLE IF NOT EXISTS public.knowledge_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  tipo text NOT NULL,                 -- participa|possui_aj|possui_magistrado|pertence_grupo|tramita_em|credor_de|origem_documental
  atributos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_entity_id, to_entity_id, tipo)
);
GRANT SELECT ON public.knowledge_relations TO authenticated;
GRANT ALL ON public.knowledge_relations TO service_role;
ALTER TABLE public.knowledge_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_relations_read" ON public.knowledge_relations
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_kr_from ON public.knowledge_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_kr_to ON public.knowledge_relations(to_entity_id);

-- Eventos processuais (timeline)
CREATE TABLE IF NOT EXISTS public.knowledge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  tipo text NOT NULL,                 -- distribuicao|peticao|despacho|processamento|nomeacao_aj|plano|assembleia|sentenca|encerramento
  data_evento date,
  descricao text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash_evento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, hash_evento)
);
GRANT SELECT ON public.knowledge_events TO authenticated;
GRANT ALL ON public.knowledge_events TO service_role;
ALTER TABLE public.knowledge_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_events_read" ON public.knowledge_events
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_kev_entity ON public.knowledge_events(entity_id, data_evento);

-- Indicadores comerciais
CREATE TABLE IF NOT EXISTS public.knowledge_commercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  prioridade text,
  complexidade text,
  potencial_economico numeric,
  probabilidade_aj numeric,
  interesse_bex numeric,
  situacao_comercial text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_commercial TO authenticated;
GRANT ALL ON public.knowledge_commercial TO service_role;
ALTER TABLE public.knowledge_commercial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_commercial_read" ON public.knowledge_commercial
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_kc_entity ON public.knowledge_commercial(entity_id);

-- Governança / origem documental do conhecimento
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  versao integer NOT NULL DEFAULT 1,
  document_id text,
  registry_id uuid,
  business_fact jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash_sha256 text,
  motor_ia text,
  confiabilidade numeric,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_sources_read" ON public.knowledge_sources
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ks_entity ON public.knowledge_sources(entity_id);
CREATE INDEX IF NOT EXISTS idx_ks_doc ON public.knowledge_sources(document_id);

-- updated_at triggers
CREATE TRIGGER trg_ke_updated BEFORE UPDATE ON public.knowledge_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kr_updated BEFORE UPDATE ON public.knowledge_relations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kc_updated BEFORE UPDATE ON public.knowledge_commercial
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Upsert versionado (aprendizado contínuo, nunca apaga histórico) =====
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
      p_tipo, p_chave, COALESCE(p_nome, p_chave), lower(unaccent_safe(COALESCE(p_nome, p_chave))),
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
      UPDATE public.knowledge_entities
         SET ultima_atualizacao = now()
       WHERE id = e.id;
      RETURN e.id;
    END IF;

    new_version := e.versao + 1;

    UPDATE public.knowledge_entities
       SET dados = merged,
           nome = COALESCE(NULLIF(trim(p_nome),''), nome),
           nome_normalizado = lower(unaccent_safe(COALESCE(NULLIF(trim(p_nome),''), nome))),
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

-- Pesquisa inteligente
CREATE OR REPLACE FUNCTION public.knowledge_search(
  p_query text,
  p_tipo text DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS SETOF public.knowledge_entities
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.knowledge_entities
   WHERE (p_tipo IS NULL OR tipo = p_tipo)
     AND (
       p_query IS NULL OR length(trim(p_query)) = 0
       OR nome ILIKE '%'||p_query||'%'
       OR chave_natural ILIKE '%'||p_query||'%'
       OR COALESCE(municipio,'') ILIKE '%'||p_query||'%'
       OR COALESCE(uf,'') ILIKE '%'||p_query||'%'
       OR COALESCE(tribunal,'') ILIKE '%'||p_query||'%'
       OR dados::text ILIKE '%'||p_query||'%'
     )
   ORDER BY ultima_atualizacao DESC
   LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
REVOKE ALL ON FUNCTION public.knowledge_search(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_search(text,text,integer) TO authenticated, service_role;

-- Indicadores agregados
CREATE OR REPLACE FUNCTION public.knowledge_indicators()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'empresas',        (SELECT count(*) FROM public.knowledge_entities WHERE tipo='empresa'),
    'processos',       (SELECT count(*) FROM public.knowledge_entities WHERE tipo='processo'),
    'administradores', (SELECT count(*) FROM public.knowledge_entities WHERE tipo='pessoa_aj'),
    'magistrados',     (SELECT count(*) FROM public.knowledge_entities WHERE tipo='pessoa_magistrado'),
    'grupos',          (SELECT count(*) FROM public.knowledge_entities WHERE tipo='grupo_economico'),
    'eventos',         (SELECT count(*) FROM public.knowledge_events),
    'versoes',         (SELECT count(*) FROM public.knowledge_entity_versions),
    'por_estado',      (SELECT COALESCE(jsonb_object_agg(COALESCE(uf,'ND'), n),'{}'::jsonb)
                          FROM (SELECT uf, count(*) n FROM public.knowledge_entities
                                 WHERE tipo='empresa' GROUP BY uf) t),
    'por_tribunal',    (SELECT COALESCE(jsonb_object_agg(COALESCE(tribunal,'ND'), n),'{}'::jsonb)
                          FROM (SELECT tribunal, count(*) n FROM public.knowledge_entities
                                 WHERE tipo='processo' GROUP BY tribunal) t),
    'ranking_aj',      (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
                          SELECT e.nome, count(r.id) processos
                            FROM public.knowledge_entities e
                            LEFT JOIN public.knowledge_relations r ON r.to_entity_id = e.id AND r.tipo='possui_aj'
                           WHERE e.tipo='pessoa_aj'
                           GROUP BY e.nome ORDER BY 2 DESC LIMIT 10) x),
    'ranking_magistrados', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
                          SELECT e.nome, count(r.id) processos
                            FROM public.knowledge_entities e
                            LEFT JOIN public.knowledge_relations r ON r.to_entity_id = e.id AND r.tipo='possui_magistrado'
                           WHERE e.tipo='pessoa_magistrado'
                           GROUP BY e.nome ORDER BY 2 DESC LIMIT 10) x)
  );
$$;
REVOKE ALL ON FUNCTION public.knowledge_indicators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_indicators() TO authenticated, service_role;
