
-- ============ prospeccao_uploads ============
CREATE TABLE public.prospeccao_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('xlsx','csv','pdf')),
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','processando','concluido','erro')),
  rows_count integer NOT NULL DEFAULT 0,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_uploads TO authenticated;
GRANT ALL ON public.prospeccao_uploads TO service_role;
ALTER TABLE public.prospeccao_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own uploads"
  ON public.prospeccao_uploads FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'));

-- ============ prospeccao_linhas ============
CREATE TABLE public.prospeccao_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NULL REFERENCES public.prospeccao_uploads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id_servico text NULL,
  numero_processo text NULL,
  parte_con_nome text NULL,
  parte_con_cnpj text NULL,
  parte_con_qualif text NULL,
  parte_pro_nome text NULL,
  parte_pro_cnpj text NULL,
  denominacao text NULL,
  orgao_tribunal text NULL,
  esfera text NULL,
  instancia text NULL,
  uf text NULL,
  municipio text NULL,
  area_judicial text NULL,
  assunto_judicial text NULL,
  acao_judicial text NULL,
  valor_pleito numeric NULL,
  status_processo text NULL,
  dt_inicio date NULL,
  dt_cad_causa date NULL,
  processo_eletronico boolean NULL,
  link_documento text NULL,
  -- Campos extraídos por IA do PDF da petição:
  advogado_nome text NULL,
  advogado_oab text NULL,
  endereco_requerente text NULL,
  tipo_acao text NULL,
  data_protocolo date NULL,
  pedidos_principais text NULL,
  ai_extracted jsonb NULL,
  ai_status text NOT NULL DEFAULT 'pendente' CHECK (ai_status IN ('pendente','baixado','extraido','erro','sem_link')),
  ai_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospeccao_linhas_user ON public.prospeccao_linhas(user_id);
CREATE INDEX idx_prospeccao_linhas_status ON public.prospeccao_linhas(ai_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_linhas TO authenticated;
GRANT ALL ON public.prospeccao_linhas TO service_role;
ALTER TABLE public.prospeccao_linhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own linhas"
  ON public.prospeccao_linhas FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'));

-- ============ prospeccao_pdf_jobs ============
CREATE TABLE public.prospeccao_pdf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id uuid NOT NULL REFERENCES public.prospeccao_linhas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','baixado','extraido','erro')),
  storage_path text NULL,
  onedrive_path text NULL,
  pdf_sha256 text NULL,
  extracted_json jsonb NULL,
  error text NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospeccao_jobs_status ON public.prospeccao_pdf_jobs(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_pdf_jobs TO authenticated;
GRANT ALL ON public.prospeccao_pdf_jobs TO service_role;
ALTER TABLE public.prospeccao_pdf_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own jobs"
  ON public.prospeccao_pdf_jobs FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'gestor_ia') OR public.has_role(auth.uid(),'coordenador'));

-- Triggers updated_at (reutiliza public.update_updated_at_column se existir; senão cria)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_prospeccao_uploads_updated BEFORE UPDATE ON public.prospeccao_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prospeccao_linhas_updated BEFORE UPDATE ON public.prospeccao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prospeccao_pdf_jobs_updated BEFORE UPDATE ON public.prospeccao_pdf_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
