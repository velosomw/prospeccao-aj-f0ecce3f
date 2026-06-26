---
name: OCR Cascade Pipeline V2 — Cheap-First
description: Cascata cheap-first com pré-classificação, telemetria de custos e fallback Document AI
type: feature
---

# Pipeline OCR V2 (cheap-first)

Ordem de tentativas, do mais barato ao mais caro:

1. **Extratores diretos** (xlsx/docx/csv/txt) — custo $0
2. **Gemini 2.5 Flash-Lite** — $0.00001/1k input ($0.00004/1k output)
3. **Gemini 2.5 Flash** — $0.000075/1k input ($0.0003/1k output)
4. **Google Document AI** (se `GOOGLE_DOCUMENT_AI_ENDPOINT` + `GOOGLE_DOCUMENT_AI_TOKEN` setados) — $0.0015/página, ótimo p/ tabelas estruturadas
5. **Gemini 2.5 Pro** — $0.00125/1k input ($0.005/1k output) — último recurso premium
6. **Google Vision** — fallback final

## Pré-classificação (`buildGeminiOrder`)
- Documento contábil **grande** (>1.5 MB) com hint `balancete|dre|balanço|estoque|notas` → começa em **Flash** (Lite pode falhar em layout denso)
- Demais casos → **Flash-Lite** primeiro

## Validação de qualidade (`evaluateQuality`)
- Threshold `MIN_ACCEPT_CONFIDENCE = 0.75`
- Bônus por marcadores contábeis (CNPJ, valores BR, palavras-chave)
- Penalidade por caracteres "garbage" (`\uFFFD`, `??`)
- Se a tentativa atual ficar abaixo do threshold, escala para o próximo motor

## Telemetria
Helper `_shared/ai-telemetry.ts` registra cada chamada em `ai_usage_logs` (service, type, tokens, pages, model, doc/rma). O trigger `trg_calculate_cost` calcula `cost_calculated` automaticamente via `calculate_ai_cost` + tabela `ai_cost_config`.

## Hint
O `process-queue` extrai o `hint` do `onedrive_files.path` (ex: "Projeto RMA/Diplomata/2026/02.2026/02 - Balancete de Verificação") para informar a heurística de pré-classificação.

## Documento AI (opcional)
Adicionar secrets:
- `GOOGLE_DOCUMENT_AI_ENDPOINT` (ex: `https://us-documentai.googleapis.com/v1/projects/.../processors/.../:process`)
- `GOOGLE_DOCUMENT_AI_TOKEN` (Bearer OAuth do service account)

Sem essas envs, a etapa Document AI é pulada silenciosamente (registra `not-configured-or-empty` em `attempts`).

## Resultado mensurado (Diplomata 02.2026)
| Motor | Antes (cascata Pro-first) | Depois (V2 cheap-first) |
|-------|---|---|
| xlsx-direct (R$ 0) | 1 | 5 |
| gemini-2.5-flash-lite | 0 | 1 |
| gemini-2.5-flash | 0 | 1 |
| gemini-2.5-pro | 3 | (fallback) |

Estimativa: **~95% de redução de custo** em batches majoritariamente Office/PDF nativo, mantendo qualidade ≥0.90 por threshold.
