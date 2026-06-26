-- Tabela de empresas
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  sector text,
  cnae text,
  phone text,
  phone_fixed text,
  email text,
  contact_name text,
  address text,
  city text,
  uf text,
  zip text,
  notes text,
  status text NOT NULL DEFAULT 'ativa',
  payment_status text NOT NULL DEFAULT 'em_dia',
  payment_due_date date,
  source text NOT NULL DEFAULT 'auditor',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_companies" ON public.companies
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "owner_insert_companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner_update_companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "owner_delete_companies" ON public.companies
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role));

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_companies_created_by ON public.companies(created_by);

-- Tabela de tópicos RMA selecionados por empresa
CREATE TABLE IF NOT EXISTS public.company_rma_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  topic_number integer NOT NULL,
  topic_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, topic_number)
);

ALTER TABLE public.company_rma_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_topics_via_company" ON public.company_rma_topics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_rma_topics.company_id
      AND (c.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  ));

CREATE POLICY "insert_topics_via_company" ON public.company_rma_topics
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_rma_topics.company_id
      AND (c.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  ));

CREATE POLICY "delete_topics_via_company" ON public.company_rma_topics
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = company_rma_topics.company_id
      AND (c.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  ));

CREATE INDEX idx_company_rma_topics_company ON public.company_rma_topics(company_id);