ALTER TABLE public.onedrive_files
  ADD COLUMN IF NOT EXISTS requires_manual_upload boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS learning_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_learning_error text,
  ADD COLUMN IF NOT EXISTS last_learning_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onedrive_files_manual_upload
  ON public.onedrive_files (rma_id) WHERE requires_manual_upload = true;