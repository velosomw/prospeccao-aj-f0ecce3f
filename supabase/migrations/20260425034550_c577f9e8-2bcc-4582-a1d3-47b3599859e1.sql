
CREATE TABLE public.ocr_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  folder_path TEXT NOT NULL,
  accepted_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ocr_engine TEXT NOT NULL DEFAULT 'tesseract',
  ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  sub_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  system_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ocr_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_ocr_agents" ON public.ocr_agents
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "admins_insert_ocr_agents" ON public.ocr_agents
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "admins_update_ocr_agents" ON public.ocr_agents
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "admins_delete_ocr_agents" ON public.ocr_agents
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE TRIGGER trg_ocr_agents_updated_at
  BEFORE UPDATE ON public.ocr_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ocr_agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ocr_agents(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  detected_type TEXT,
  extracted_data JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ocr_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_ocr_runs" ON public.ocr_agent_runs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "admins_insert_ocr_runs" ON public.ocr_agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE INDEX idx_ocr_agent_runs_agent ON public.ocr_agent_runs(agent_id, created_at DESC);
