DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'balancete_consolidado','lancamentos','bs_consolidado','dre_consolidado',
    'fluxo_caixa_consolidado','balancete_runs','onedrive_files',
    'processing_queue','rma_analysis_results','rma_monthly_snapshots',
    'rma_document_sections','rma_document_charts','document_state'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;