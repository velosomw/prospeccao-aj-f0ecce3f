
-- 1. Histórico de varreduras incrementais
CREATE TABLE IF NOT EXISTS public.onedrive_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL DEFAULT gen_random_uuid(),
  triggered_by uuid,
  source text NOT NULL DEFAULT 'monitor_cron', -- monitor_cron|manual|sync_rma
  company_id uuid,
  rma_id text,
  ano integer,
  mes integer,
  folder_path text,
  files_scanned integer NOT NULL DEFAULT 0,
  files_new integer NOT NULL DEFAULT 0,
  files_updated integer NOT NULL DEFAULT 0,
  files_ignored integer NOT NULL DEFAULT 0,
  files_invalid integer NOT NULL DEFAULT 0,
  files_inactive integer NOT NULL DEFAULT 0,
  duration_ms integer,
  status text NOT NULL DEFAULT 'success', -- success|partial|error
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onedrive_scan_runs_scan ON public.onedrive_scan_runs(scan_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_scan_runs_company ON public.onedrive_scan_runs(company_id, created_at DESC);

ALTER TABLE public.onedrive_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_runs_admin_all" ON public.onedrive_scan_runs;
CREATE POLICY "scan_runs_admin_all" ON public.onedrive_scan_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

DROP POLICY IF EXISTS "scan_runs_consultor_read" ON public.onedrive_scan_runs;
CREATE POLICY "scan_runs_consultor_read" ON public.onedrive_scan_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = onedrive_scan_runs.company_id
        AND (c.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.company_consultants cc
                     WHERE cc.company_id = c.id AND cc.consultant_user_id = auth.uid()))
    )
  );

-- 2. Coluna last_scan_id em onedrive_files (para detecção de removidos)
ALTER TABLE public.onedrive_files
  ADD COLUMN IF NOT EXISTS last_scan_id uuid;
CREATE INDEX IF NOT EXISTS idx_onedrive_files_last_scan ON public.onedrive_files(last_scan_id);

-- 3. RPC: marca como 'inactive' arquivos da pasta que não foram vistos no scan atual
CREATE OR REPLACE FUNCTION public.mark_missing_files_inactive(
  p_scan_id uuid,
  p_company_id uuid,
  p_rma_id text,
  p_folder_prefix text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  UPDATE public.onedrive_files
     SET status = 'inactive',
         updated_at = now()
   WHERE company_id IS NOT DISTINCT FROM p_company_id
     AND rma_id IS NOT DISTINCT FROM p_rma_id
     AND (p_folder_prefix IS NULL OR path LIKE p_folder_prefix || '%')
     AND status NOT IN ('inactive')
     AND (last_scan_id IS NULL OR last_scan_id <> p_scan_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 4. View de métricas do agente incremental
CREATE OR REPLACE VIEW public.onedrive_incremental_metrics
WITH (security_invoker = true) AS
SELECT
  company_id,
  COUNT(*) AS total_scans,
  SUM(files_scanned) AS total_files_scanned,
  SUM(files_new) AS total_new,
  SUM(files_updated) AS total_updated,
  SUM(files_ignored) AS total_ignored,
  SUM(files_inactive) AS total_inactive,
  CASE WHEN SUM(files_scanned) > 0
       THEN ROUND(100.0 * SUM(files_updated) / NULLIF(SUM(files_scanned),0), 2)
       ELSE 0 END AS reprocess_rate_pct,
  AVG(duration_ms)::integer AS avg_duration_ms,
  MAX(created_at) AS last_scan_at
FROM public.onedrive_scan_runs
WHERE created_at > now() - interval '30 days'
GROUP BY company_id;
