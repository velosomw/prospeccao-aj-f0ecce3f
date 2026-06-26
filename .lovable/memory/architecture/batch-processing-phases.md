---
name: Batch Processing Phases 1-3
description: Worker assíncrono com backoff, rate-limit por bucket (token bucket por provider/model), chunking de PDFs grandes e indicador de progresso por pasta
type: feature
---
Sistema completo aplicado a TODOS os RMAs novos e existentes.

**Fase 1 — Worker robusto** (`process-queue-worker`, cron 30s)
- `claim_processing_jobs` (atômico FOR UPDATE SKIP LOCKED), lock TTL 5min
- `fail_processing_job` com backoff exponencial: 30s → 2m → 10m → 1h → 6h
- `complete_processing_job` limpa lock
- Auto-release de locks expirados

**Fase 2 — Rate-limit buckets** (`rate_limit_buckets`)
- 1 bucket por (provider, model). Seed: gemini flash-lite (60rpm), flash (30rpm), pro (10rpm)
- `check_rate_limit` chamado pelo worker ANTES de invocar provider (preflight)
- `consume_rate_limit` registra +1 request após sucesso
- `block_rate_limit` registra `blocked_until` quando provider devolve 429
- `requeue_rate_limited_jobs` (cron 1min) libera fila quando bucket expira

**Fase 3 — Chunking + UI**
- `processing_queue` ganhou `parent_job_id`, `chunk_index`, `chunks_total`, `chunk_payload`
- Edge function `merge-chunks` consolida sub-jobs quando todos done
- View `folder_processing_status` (security_invoker) agrega contadores por pasta
- Componente `<FolderProcessingIndicator>` consome a view com poll 5s e mostra: `12/20 OCR ✓ • 5 aguardando rate-limit (1m23s) • 3 chunks`

**Status colors**: usar tokens semânticos (red <33%, orange 33-67%, green >67%).
