-- Ajusta o RMA-0002 (Diplomata) para o período produtivo 02/2026
UPDATE public.companies
SET current_period_month = 2,
    execution_year = 2026,
    updated_at = now()
WHERE id = '0c8e41f8-6675-472d-b5c4-633fbade5975';

-- Reseta itens em erro do mês 02/2026 desta empresa para reprocesso
UPDATE public.processing_queue
SET status = 'pending',
    attempts = 0,
    error_message = NULL,
    finished_at = NULL,
    picked_at = NULL
WHERE company_id = '0c8e41f8-6675-472d-b5c4-633fbade5975'
  AND mes = 2
  AND status IN ('error', 'processing');

-- Garante prioridade alta para o mês corrente
UPDATE public.processing_queue
SET priority = 1
WHERE company_id = '0c8e41f8-6675-472d-b5c4-633fbade5975'
  AND mes = 2
  AND status = 'pending';