-- Permitir plano de contas global (template) sem company_id
ALTER TABLE public.chart_of_accounts ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
ALTER TABLE public.chart_of_accounts ADD COLUMN IF NOT EXISTS template_name text;

-- Constraint: ou tem company_id, ou é template
ALTER TABLE public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_scope_check;
ALTER TABLE public.chart_of_accounts ADD CONSTRAINT chart_of_accounts_scope_check
  CHECK ((company_id IS NOT NULL) OR (is_template = true));

-- Unicidade: dentro de uma empresa, conta é única; entre templates, (template_name, conta) é única
DROP INDEX IF EXISTS chart_of_accounts_company_conta_idx;
CREATE UNIQUE INDEX chart_of_accounts_company_conta_idx
  ON public.chart_of_accounts (company_id, conta) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_template_conta_idx
  ON public.chart_of_accounts (template_name, conta) WHERE is_template = true;

-- RLS: autenticados leem templates
DROP POLICY IF EXISTS "Autenticados leem chart_of_accounts templates" ON public.chart_of_accounts;
CREATE POLICY "Autenticados leem chart_of_accounts templates"
  ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (is_template = true);