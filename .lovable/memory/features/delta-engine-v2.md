---
name: Delta Engine Standalone
description: Edge function delta-engine + paralelismo BATCH_SIZE no onedrive-sync-rma; varre subpasta arbitrária e enfileira só new/updated
type: feature
---

# Delta Engine V2 — paralelismo + endpoint standalone

## O que mudou
1. **`onedrive-sync-rma`** agora processa arquivos em batches de 10 com `Promise.allSettled` (antes era loop sequencial). Mantém a mesma resposta `{ summary, deltas, log }`.
2. **Nova edge `delta-engine`** (`supabase/functions/delta-engine/index.ts`) — varre uma subpasta arbitrária dentro de `Projeto RMA` (recursivo, depth-limited), classifica `new | updated | unchanged | invalid` via `trackAndEnqueue`, dispara `process-queue` se houver enfileirados.

## Contrato delta-engine
POST JSON:
```
{
  "path": "EmpresaA/2026/05.2026",   // opcional, default = base root
  "companyId": "...", "rmaId": "RMA-001", "ano": 2026, "mes": 5,
  "batchSize": 10, "maxDepth": 3, "triggerWorker": true
}
```
Resposta:
```
{ success, path, scanned, new, updated, unchanged, invalid, enqueued, sample }
```

## Por que existe (vs onedrive-sync-rma)
- `onedrive-sync-rma` é orientado a um RMA/empresa/período específico e materializa `pipeline_documents`.
- `delta-engine` é varredura pura: útil para cron diagnóstico, scans manuais ou pipelines que só querem disparar o tracker + fila sem amarrar a um RMA.

## Idempotência garantida
- `trackAndEnqueue` upserta `onedrive_files` por `file_id` (PK).
- Trigger SQL `trg_enqueue_processing` evita duplicatas em `processing_queue` (filtra `pending|processing` por `file_id`).
