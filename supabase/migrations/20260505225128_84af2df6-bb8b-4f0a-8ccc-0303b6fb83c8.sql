ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_rma_id_unique;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_rma_id_key;
DROP INDEX IF EXISTS public.companies_rma_id_unique;
DROP INDEX IF EXISTS public.companies_rma_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS companies_rma_year_company_unique
  ON public.companies (lower(name), rma_id, execution_year)
  WHERE rma_id IS NOT NULL AND execution_year IS NOT NULL;