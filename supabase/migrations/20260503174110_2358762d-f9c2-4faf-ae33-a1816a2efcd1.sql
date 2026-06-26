CREATE UNIQUE INDEX IF NOT EXISTS uq_processing_queue_active_file
  ON public.processing_queue (file_id)
  WHERE status IN ('pending', 'processing');