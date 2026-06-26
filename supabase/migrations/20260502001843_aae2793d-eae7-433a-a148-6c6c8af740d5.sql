-- IDs a remover (Diplomata duplicadas — mantemos 0c8e41f8 que tem mais dados)
WITH dup_ids AS (
  SELECT unnest(ARRAY[
    '91f51bea-18f0-4204-9fae-44683226327a'::uuid,
    '08392234-f7e7-4e7a-8f04-02af9c644da6'::uuid
  ]) AS id
)
-- Remove dependências em cascata manual (sem FKs declaradas)
, d1 AS (DELETE FROM public.company_consultants    WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d2 AS (DELETE FROM public.company_rma_topics     WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d3 AS (DELETE FROM public.balancete_runs         WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d4 AS (DELETE FROM public.balancete_periods      WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d5 AS (DELETE FROM public.balancete_consolidado  WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d6 AS (DELETE FROM public.balancete_versions     WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d7 AS (DELETE FROM public.balancete_validacoes   WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d8 AS (DELETE FROM public.balancete_conflicts    WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d9 AS (DELETE FROM public.lancamentos            WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d10 AS (DELETE FROM public.document_state        WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d11 AS (DELETE FROM public.cross_validation_runs WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d12 AS (DELETE FROM public.dre_consolidado       WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d13 AS (DELETE FROM public.fluxo_caixa_consolidado WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d14 AS (DELETE FROM public.account_mapping_cache WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
, d15 AS (DELETE FROM public.chart_of_accounts     WHERE company_id IN (SELECT id FROM dup_ids) RETURNING 1)
DELETE FROM public.companies WHERE id IN (SELECT id FROM dup_ids);

-- Limpa histórico de atribuição das empresas removidas (se a tabela existir)
DELETE FROM public.rma_assignment_history
 WHERE company_id IN (
   '91f51bea-18f0-4204-9fae-44683226327a'::uuid,
   '08392234-f7e7-4e7a-8f04-02af9c644da6'::uuid
 );

-- Garante unicidade futura do rma_id (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS companies_rma_id_unique
  ON public.companies (rma_id)
  WHERE rma_id IS NOT NULL;