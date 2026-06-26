ALTER TABLE public.companies ADD COLUMN rma_id text;
CREATE INDEX IF NOT EXISTS idx_companies_rma_id ON public.companies(rma_id);