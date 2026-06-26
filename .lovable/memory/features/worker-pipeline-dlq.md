---
name: Worker Pipeline DLQ + Concurrency
description: process-queue com paralelismo controlado (workers concorrentes) e Dead Letter Queue (failed_jobs) para jobs esgotados
type: feature
---

# Worker Pipeline V2 — Concurrency + DLQ

## Mudanças
1. **Paralelismo controlado** em `process-queue` — N workers concorrentes (default 3, máx 10) consumindo a mesma fila in-memory via `Promise.all(workers)`. Body: `{ batch_size, concurrency }`.
2. **Dead Letter Queue** — tabela `public.failed_jobs` arquiva jobs que esgotaram `max_attempts` (ou que falharam sem possibilidade de retry, ex: pipeline_documents ausente).
3. Função SQL `archive_failed_job(p_queue_id uuid)` (SECURITY DEFINER, GRANT só para service_role) faz a cópia atômica.

## Fluxo de erro
- Falha + `attempts < max_attempts` → volta para `pending` (retry automático).
- Falha + esgotou tentativas → `status='error'`, `markError()` no tracker, **insere em `failed_jobs`** com `original_queue_id`, `attempts`, `error_message`, `payload`.
- `pipeline_documents` ausente → vai direto pra DLQ (não adianta retry).

## Resposta enriquecida
```
{ success, processed, summary: { total, ok, retry, dlq, errors, concurrency }, results }
```

## RLS
- `failed_jobs`: só Gestor IA / Coordenador via `has_role()`.

## Pendente (futuro)
- UI no Gestor IA para listar `failed_jobs` e botão "reprocessar" (re-enfileira no `processing_queue`).
- Cron `* * * * *` chamando process-queue com batch_size=10/concurrency=3.
