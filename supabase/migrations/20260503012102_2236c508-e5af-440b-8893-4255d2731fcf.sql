
ALTER TABLE public.batch_processing_config
  ADD COLUMN IF NOT EXISTS off_peak_start_hour smallint NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS off_peak_end_hour smallint NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS off_peak_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS max_batch_size integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_concurrent_submits integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS schedule_in_off_peak boolean NOT NULL DEFAULT true;

ALTER TABLE public.batch_processing_config
  DROP CONSTRAINT IF EXISTS batch_off_peak_hours_check;
ALTER TABLE public.batch_processing_config
  ADD CONSTRAINT batch_off_peak_hours_check
  CHECK (off_peak_start_hour BETWEEN 0 AND 23 AND off_peak_end_hour BETWEEN 0 AND 23);

-- Permitir INSERT do singleton por gestor (para edição via upsert)
DROP POLICY IF EXISTS "batch_config_insert_gestor" ON public.batch_processing_config;
CREATE POLICY "batch_config_insert_gestor" ON public.batch_processing_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

-- Função: próximo início de janela off-peak (ou agora, se já estamos dentro dela)
CREATE OR REPLACE FUNCTION public.next_off_peak_at(p_from timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.batch_processing_config;
  tz text;
  local_ts timestamp;
  cur_hour int;
  start_h int;
  end_h int;
  candidate timestamp;
  in_window boolean;
BEGIN
  SELECT * INTO cfg FROM public.batch_processing_config WHERE id = 1;
  IF NOT FOUND OR NOT COALESCE(cfg.schedule_in_off_peak, true) THEN
    RETURN p_from;
  END IF;
  tz := COALESCE(cfg.off_peak_timezone, 'America/Sao_Paulo');
  start_h := cfg.off_peak_start_hour;
  end_h := cfg.off_peak_end_hour;

  local_ts := (p_from AT TIME ZONE tz);
  cur_hour := EXTRACT(HOUR FROM local_ts)::int;

  -- Janela cruza meia-noite? (ex: 22 → 6)
  IF start_h = end_h THEN
    RETURN p_from; -- janela de 0h: ignora
  ELSIF start_h < end_h THEN
    in_window := cur_hour >= start_h AND cur_hour < end_h;
  ELSE
    in_window := cur_hour >= start_h OR cur_hour < end_h;
  END IF;

  IF in_window THEN
    RETURN p_from;
  END IF;

  -- Próximo início da janela hoje ou amanhã
  candidate := date_trunc('day', local_ts) + make_interval(hours => start_h);
  IF candidate <= local_ts THEN
    candidate := candidate + interval '1 day';
  END IF;
  RETURN candidate AT TIME ZONE tz;
END;
$$;

-- Atualiza enqueue_deferred_job para usar next_off_peak_at + cap em max_eta_hours
CREATE OR REPLACE FUNCTION public.enqueue_deferred_job(
  p_file_id text,
  p_company_id uuid,
  p_rma_id text,
  p_folder_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_pages integer,
  p_document_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.batch_processing_config;
  new_id uuid;
  computed_eta timestamptz;
  cap_eta timestamptz;
BEGIN
  SELECT * INTO cfg FROM public.batch_processing_config WHERE id = 1;

  SELECT id INTO new_id FROM public.deferred_jobs
   WHERE file_id = p_file_id AND status NOT IN ('done','failed','cancelled')
   LIMIT 1;
  IF FOUND THEN RETURN new_id; END IF;

  computed_eta := public.next_off_peak_at(now());
  cap_eta := now() + make_interval(hours => COALESCE(cfg.max_eta_hours, 24));
  IF computed_eta > cap_eta THEN computed_eta := cap_eta; END IF;

  INSERT INTO public.deferred_jobs (
    file_id, company_id, rma_id, folder_path, file_name, mime_type,
    file_size_bytes, page_count_estimate, document_id, payload, eta_at
  ) VALUES (
    p_file_id, p_company_id, p_rma_id, p_folder_path, p_file_name, p_mime_type,
    p_size_bytes, p_pages, p_document_id, COALESCE(p_payload,'{}'::jsonb),
    computed_eta
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
