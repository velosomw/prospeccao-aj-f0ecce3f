---
name: OneDrive Incremental Re-evaluation Agent
description: Crawler + Delta Engine + fila priorizada com scan_id, detecção de removidos, métricas e cron 5min
type: feature
---

Agente de reavaliação incremental do OneDrive (RMA).

**Componentes**
- Crawler: `monitor-onedrive` (cron `*/5 * * * *`) → varre empresas com `period_active=true`, gera 1 `scanId` por empresa e injeta via header `x-scan-id` em `onedrive-sync-rma`.
- Delta Engine: `_shared/delta-engine.ts` — `decideDelta` classifica `new|updated|ignore` por etag, last_modified e last_processed_at; `trackAndEnqueue` aplica prioridade inteligente (novo=10, updated=8) na `processing_queue`.
- Removidos: RPC `mark_missing_files_inactive(scan_id, company_id, rma_id, folder_prefix)` marca como `inactive` arquivos não vistos no scan atual.
- Histórico/métricas: tabela `onedrive_scan_runs` (1 linha por (empresa, varredura)) + view `onedrive_incremental_metrics` (taxa de reprocessamento, latência, totais 30d).
- Loader sob demanda: `process-queue-worker` (cron 1min) só baixa o conteúdo quando o job sai da fila; arquivos grandes são desviados para `deferred_jobs` (Document AI Batch).

**Status de arquivo (`onedrive_files.status`)**: `queued|processed|error|inactive`. `last_scan_id` correlaciona com `onedrive_scan_runs.scan_id`.

**Idempotência**: `processing_queue` evita duplicatas via filtro `pending|processing` no trigger e na inserção.
