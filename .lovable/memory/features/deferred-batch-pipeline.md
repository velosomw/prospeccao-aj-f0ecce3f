---
name: Deferred Batch Pipeline
description: Fila batch econômica (Document AI Batch ~50% mais barato, até 24h) para arquivos >10MB ou >50 páginas. Tabela deferred_jobs + roteador no worker + UI badges.
type: feature
---

# Pipeline Batch Econômico (Deferred)

## Critério de roteamento (default — configurável em `batch_processing_config`)
- size > 10 MB **OU** páginas > 50 → vai para fila `deferred_jobs`
- Caso contrário → cascata síncrona normal (cheap-first)

## Fluxo
1. `process-queue-worker` chama `should_defer_file()` antes de invocar `ai-full-process`.
2. Se sim → `enqueue_deferred_job()` cria registro com `eta_at = now() + 6h` (default).
3. Marca `processing_queue.processing_mode = 'deferred'` e `complete_processing_job()` libera o slot.
4. Cron `docai-batch-poll-every-10min` (pg_cron) roda `docai-batch-poll`.
5. **STUB MODE**: enquanto `GCS_DOCAI_BUCKET` + `GOOGLE_DOCUMENT_AI_BATCH_ENDPOINT` não setados, jobs ficam aguardando sem erro.
6. Quando infra GCP estiver pronta: download do OneDrive → upload GCS → `:batchProcess` → polling → consolida em `ocr_results` → dispara `ai-full-process`.

## Configuração GCP necessária (futura)
- Secret `GCS_DOCAI_BUCKET` (ex: `bex-docai-batch`)
- Secret `GOOGLE_DOCUMENT_AI_BATCH_ENDPOINT` (URL do processor `:batchProcess`)
- Reusa `GOOGLE_VISION_CREDENTIALS` (Service Account com acesso a Storage + Document AI)

## UI
- `<DeferredBatchIndicator variant="rma-summary">` no topo de RMAProcessamentoTab — mostra "X arquivos em batch · pronto em até Yh"
- `<DeferredBatchIndicator variant="folder">` para badge de pasta
- `<DeferredFileBadge fileId>` para badge inline em arquivos

## Economia esperada
- ~50% no custo dos arquivos grandes (que são os que mais consomem hoje)
- Sem impacto no SLA dos arquivos pequenos/médios (continuam síncronos)
