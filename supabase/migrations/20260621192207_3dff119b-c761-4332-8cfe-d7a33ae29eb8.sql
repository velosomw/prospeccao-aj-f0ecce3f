
CREATE INDEX IF NOT EXISTS idx_ai_extractions_doc_status_created ON public.ai_extractions (document_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_results_doc_status_created ON public.ocr_results (document_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_queue_file_status ON public.processing_queue (file_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_documents_rma_external ON public.pipeline_documents (rma_id, external_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_company ON public.onedrive_files (company_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_files_file_id ON public.onedrive_files (file_id);
CREATE INDEX IF NOT EXISTS idx_llm_cache_prompt_hash ON public.llm_response_cache (prompt_hash);
