-- ─────────────────────────────────────────────────────────────
-- FASE 1: Pipeline Incremental — Schema
-- ─────────────────────────────────────────────────────────────

-- 1. ONEDRIVE_FILES — tracking de cada arquivo do OneDrive
CREATE TABLE IF NOT EXISTS public.onedrive_files (
  file_id TEXT PRIMARY KEY,
  drive_id TEXT,
  company_id UUID,
  rma_id TEXT,
  path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  etag TEXT,
  ctag TEXT,
  hash TEXT,
  ano INTEGER,
  mes INTEGER,
  last_modified TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'new', -- new | updated | queued | processing | processed | error | ignored
  version INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onedrive_files_company ON public.onedrive_files(company_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_rma ON public.onedrive_files(rma_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_status ON public.onedrive_files(status);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_period ON public.onedrive_files(company_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_hash ON public.onedrive_files(hash);

ALTER TABLE public.onedrive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam onedrive_files" ON public.onedrive_files
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza onedrive_files" ON public.onedrive_files
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = onedrive_files.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = onedrive_files.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER update_onedrive_files_updated_at
  BEFORE UPDATE ON public.onedrive_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. PROCESSING_QUEUE — fila de processamento
CREATE TABLE IF NOT EXISTS public.processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id TEXT NOT NULL,
  company_id UUID,
  rma_id TEXT,
  ano INTEGER,
  mes INTEGER,
  reason TEXT NOT NULL DEFAULT 'new', -- new | updated | manual_retry
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | error | canceled
  priority INTEGER NOT NULL DEFAULT 5, -- 1=alta, 5=normal, 10=baixa
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  picked_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status_priority ON public.processing_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_queue_file ON public.processing_queue(file_id);
CREATE INDEX IF NOT EXISTS idx_processing_queue_rma ON public.processing_queue(rma_id);

ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam processing_queue" ON public.processing_queue
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza processing_queue" ON public.processing_queue
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = processing_queue.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = processing_queue.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER update_processing_queue_updated_at
  BEFORE UPDATE ON public.processing_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. OCR_CACHE — cache por hash do arquivo
CREATE TABLE IF NOT EXISTS public.ocr_cache (
  file_hash TEXT PRIMARY KEY,
  raw_text TEXT,
  normalized_text TEXT,
  structured_blocks JSONB DEFAULT '{}'::jsonb,
  page_count INTEGER,
  confidence DOUBLE PRECISION,
  engine TEXT NOT NULL DEFAULT 'google_vision',
  hits INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_cache_last_used ON public.ocr_cache(last_used_at DESC);

ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam ocr_cache" ON public.ocr_cache
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Autenticados leem ocr_cache" ON public.ocr_cache
  FOR SELECT TO authenticated USING (true);

-- 4. DOCUMENT_VERSIONS — histórico imutável
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  file_id TEXT,
  version INTEGER NOT NULL,
  classe TEXT,
  agent TEXT,
  stage TEXT NOT NULL, -- ocr | extraction | validation | consolidation
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version, stage)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON public.document_versions(document_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_file ON public.document_versions(file_id);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam document_versions" ON public.document_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor visualiza document_versions" ON public.document_versions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'::app_role));

-- 5. DOCUMENT_STATE — estado atual de cada documento
CREATE TABLE IF NOT EXISTS public.document_state (
  document_id UUID PRIMARY KEY,
  file_id TEXT,
  company_id UUID,
  rma_id TEXT,
  latest_version INTEGER NOT NULL DEFAULT 1,
  last_stage TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ocr_done | extracted | validated | consolidated | error
  classe TEXT,
  agent TEXT,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_state_company ON public.document_state(company_id);
CREATE INDEX IF NOT EXISTS idx_document_state_rma ON public.document_state(rma_id);
CREATE INDEX IF NOT EXISTS idx_document_state_status ON public.document_state(status);
CREATE INDEX IF NOT EXISTS idx_document_state_file ON public.document_state(file_id);

ALTER TABLE public.document_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam document_state" ON public.document_state
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza document_state" ON public.document_state
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = document_state.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = document_state.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER update_document_state_updated_at
  BEFORE UPDATE ON public.document_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();