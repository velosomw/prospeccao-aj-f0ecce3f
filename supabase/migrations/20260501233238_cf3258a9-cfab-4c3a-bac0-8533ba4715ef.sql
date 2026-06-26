-- =====================================================================
-- RMA IA INCREMENTAL v2 — Apenas o que falta (idempotente)
-- A maior parte das tabelas já existe (onedrive_files, processing_queue,
-- ocr_cache, ai_extractions, document_state, document_versions, lancamentos,
-- balancete_consolidado, dataset_validated). Aqui adicionamos apenas:
--   1. Tabela document_latest (ponteiro rápido para versão corrente)
--   2. Função detect_file_delta()
--   3. Trigger enqueue_processing (auto-enfileira novos/atualizados)
--   4. Trigger version_document (versiona automaticamente document_state)
-- =====================================================================

-- 1) document_latest -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_latest (
  document_id uuid PRIMARY KEY,
  latest_version integer NOT NULL DEFAULT 1,
  last_stage text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_latest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam document_latest" ON public.document_latest;
CREATE POLICY "Admins gerenciam document_latest"
  ON public.document_latest
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor visualiza document_latest" ON public.document_latest;
CREATE POLICY "Consultor visualiza document_latest"
  ON public.document_latest
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'::app_role));

-- 2) detect_file_delta() --------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_file_delta(
  p_file_id text,
  p_etag text,
  p_hash text,
  p_last_modified timestamptz
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.onedrive_files%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.onedrive_files WHERE file_id = p_file_id;
  IF NOT FOUND THEN
    RETURN 'new';
  END IF;
  IF p_etag IS NOT NULL AND existing.etag IS DISTINCT FROM p_etag THEN
    RETURN 'updated';
  END IF;
  IF p_hash IS NOT NULL AND existing.hash IS DISTINCT FROM p_hash THEN
    RETURN 'updated';
  END IF;
  IF existing.last_processed_at IS NULL THEN
    RETURN 'pending';
  END IF;
  IF p_last_modified IS NOT NULL AND p_last_modified > existing.last_processed_at THEN
    RETURN 'updated';
  END IF;
  RETURN 'unchanged';
END;
$$;

-- 3) Trigger: enqueue automatic ----------------------------------------
CREATE OR REPLACE FUNCTION public.trg_enqueue_processing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Apenas enfileira quando o arquivo está marcado como novo ou atualizado
  IF NEW.status IN ('new', 'updated') THEN
    -- Evita duplicatas: só insere se não houver pending/processing para este file_id
    IF NOT EXISTS (
      SELECT 1 FROM public.processing_queue
      WHERE file_id = NEW.file_id
        AND status IN ('pending', 'processing')
    ) THEN
      INSERT INTO public.processing_queue (
        file_id, company_id, rma_id, ano, mes, reason, status, priority
      ) VALUES (
        NEW.file_id, NEW.company_id, NEW.rma_id, NEW.ano, NEW.mes,
        NEW.status, 'pending', 5
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_processing ON public.onedrive_files;
CREATE TRIGGER trg_enqueue_processing
  AFTER INSERT OR UPDATE OF status, etag, hash ON public.onedrive_files
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_processing();

-- 4) Trigger: versionamento automático ---------------------------------
CREATE OR REPLACE FUNCTION public.trg_version_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só versiona quando muda o estágio ou os dados extraídos
  IF TG_OP = 'UPDATE'
     AND NEW.last_stage IS NOT DISTINCT FROM OLD.last_stage
     AND NEW.extracted_data IS NOT DISTINCT FROM OLD.extracted_data THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.document_versions (
    document_id, file_id, version, classe, agent, stage, data, confidence
  ) VALUES (
    NEW.document_id, NEW.file_id, NEW.latest_version,
    NEW.classe, NEW.agent, NEW.last_stage,
    COALESCE(NEW.extracted_data, '{}'::jsonb),
    NEW.confidence
  )
  ON CONFLICT (document_id, version, stage) DO UPDATE
    SET data = EXCLUDED.data,
        confidence = EXCLUDED.confidence,
        classe = EXCLUDED.classe,
        agent = EXCLUDED.agent;

  INSERT INTO public.document_latest (document_id, latest_version, last_stage, updated_at)
  VALUES (NEW.document_id, NEW.latest_version, NEW.last_stage, now())
  ON CONFLICT (document_id) DO UPDATE
    SET latest_version = EXCLUDED.latest_version,
        last_stage = EXCLUDED.last_stage,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_document ON public.document_state;
CREATE TRIGGER trg_version_document
  AFTER INSERT OR UPDATE ON public.document_state
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_version_document();

-- 5) Backfill document_latest a partir do estado atual -----------------
INSERT INTO public.document_latest (document_id, latest_version, last_stage, updated_at)
SELECT document_id, latest_version, last_stage, updated_at
FROM public.document_state
ON CONFLICT (document_id) DO NOTHING;