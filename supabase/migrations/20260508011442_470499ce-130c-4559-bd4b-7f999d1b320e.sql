
ALTER TABLE public.worker_config
  ADD COLUMN IF NOT EXISTS max_reprocess_attempts integer NOT NULL DEFAULT 3;

ALTER TABLE public.onedrive_files
  ADD COLUMN IF NOT EXISTS reprocess_count integer NOT NULL DEFAULT 0;
