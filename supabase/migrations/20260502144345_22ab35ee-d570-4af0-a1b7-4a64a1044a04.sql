UPDATE public.deferred_jobs
SET status='queued', attempts=0, error_message=NULL,
    operation_name=NULL, gcs_input_uri=NULL, gcs_output_uri=NULL,
    submitted_at=NULL, completed_at=NULL
WHERE id='79118218-5914-44d1-95ef-e17a074e022c';