-- MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001

-- 1) Registro corporativo: campos de governança
ALTER TABLE public.prospeccao_document_registry
  ADD COLUMN IF NOT EXISTS projeto text DEFAULT 'prospeccao_bex',
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS processo text,
  ADD COLUMN IF NOT EXISTS conector text,
  ADD COLUMN IF NOT EXISTS idioma text,
  ADD COLUMN IF NOT EXISTS paginas integer,
  ADD COLUMN IF NOT EXISTS ocr_necessario boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificacao jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_document_id text,
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS acessos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccao_document_registry_document_id_key
  ON public.prospeccao_document_registry (document_id);
CREATE INDEX IF NOT EXISTS prospeccao_document_registry_hash_idx
  ON public.prospeccao_document_registry (hash_sha256);
CREATE INDEX IF NOT EXISTS prospeccao_document_registry_processo_idx
  ON public.prospeccao_document_registry (processo);

-- 2) Auditoria de acesso/uso por motores IA e projetos
CREATE TABLE IF NOT EXISTS public.document_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text,
  registry_id uuid REFERENCES public.prospeccao_document_registry(id) ON DELETE SET NULL,
  projeto text,
  motor_ia text,
  acao text NOT NULL,
  hash_sha256 text,
  versao integer,
  resultado text,
  tempo_ms integer,
  user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_access_log TO authenticated;
GRANT ALL ON public.document_access_log TO service_role;
ALTER TABLE public.document_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores leem auditoria documental" ON public.document_access_log;
CREATE POLICY "Gestores leem auditoria documental"
  ON public.document_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE INDEX IF NOT EXISTS document_access_log_document_idx ON public.document_access_log (document_id);
CREATE INDEX IF NOT EXISTS document_access_log_created_idx ON public.document_access_log (created_at DESC);

-- 3) Sessões temporárias de conectores (nunca credenciais permanentes)
CREATE TABLE IF NOT EXISTS public.document_connector_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conector text NOT NULL,
  session_key text NOT NULL,
  auth_type text,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conector, session_key)
);

GRANT ALL ON public.document_connector_sessions TO service_role;
ALTER TABLE public.document_connector_sessions ENABLE ROW LEVEL SECURITY;
-- sem policies: acesso exclusivo do backend (service_role)