DO $$
BEGIN
    -- Rename columns in companies
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'rma_id') THEN
        ALTER TABLE public.companies RENAME COLUMN rma_id TO prospeccao_id;
    END IF;

    -- Rename columns in failed_jobs
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'failed_jobs' AND column_name = 'rma_id') THEN
        ALTER TABLE public.failed_jobs RENAME COLUMN rma_id TO prospeccao_id;
    END IF;

    -- Rename columns in platform_audit_log
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_audit_log' AND column_name = 'rma_id') THEN
        ALTER TABLE public.platform_audit_log RENAME COLUMN rma_id TO prospeccao_id;
    END IF;

    -- Rename columns in company_context
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_context' AND column_name = 'rma_id') THEN
        ALTER TABLE public.company_context RENAME COLUMN rma_id TO prospeccao_id;
    END IF;

    -- Rename tables prefixed with rma_
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rma_assignment_history') THEN
        ALTER TABLE public.rma_assignment_history RENAME TO prospeccao_assignment_history;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rma_period_chain') THEN
        ALTER TABLE public.rma_period_chain RENAME TO prospeccao_period_chain;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rma_release_assignments') THEN
        ALTER TABLE public.rma_release_assignments RENAME TO prospeccao_release_assignments;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_rma_topics') THEN
        ALTER TABLE public.company_rma_topics RENAME TO company_prospeccao_topics;
    END IF;
    
    -- Rename views if they exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vw_prospeccao_certification_status') THEN
        -- Already renamed? Or should we rename?
        NULL;
    END IF;
END $$;
