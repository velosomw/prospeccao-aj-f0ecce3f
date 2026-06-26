---
name: Learning Documents Screen
description: Tela /gestor-ia/aprendizado — upload manual + pendentes do RMA + histórico, com OCR/IA on-the-fly e ground truth
type: feature
---

# Tela de Aprendizado de Documentos

Rota: `/gestor-ia/aprendizado` (botão "Aprendizado IA" ao lado de "Cadastrar Usuário" no header do Gestor IA).

## Infra
- **Bucket** `learning-docs` (public=true para preview por URL conhecida; LIST restrito a Gestor IA / Coordenador).
- **Tabela** `dataset_feedback` (campo, old_value, new_value) para treino fino futuro.
- **Coluna** `ai_extractions.source` ∈ {`pipeline`, `learning`}.

## Pipeline (client orquestra)
1. `uploadLearningFile` → bucket `learning-docs`.
2. `extractTextFromFile`:
   - imagem/PDF → `ocr-google-vision` com `fileUrl` (sync ou async com polling `waitForOcr`).
   - txt/csv/log → `file.text()`.
   - xlsx/xls → SheetJS (`xlsx`) → CSV concatenado por aba.
3. `processWithAI` → `ai-process` (sync ou async com `waitForProcessing`).
4. `markExtractionAsLearning` marca `source='learning'`.
5. `saveGroundTruth` → `ai-validate` (dataset_validated + embedding + prompt_examples) + diff em `dataset_feedback`.

## UI
- **Upload manual**: split view (Documento | OCR editável + JSON editável + ações). Highlight automático de valores extraídos no OCR.
- **Pendentes do RMA**: lista com filtros (classe, conf<0.85, apenas inválidos) → editor lado a lado.
- **Histórico**: tabela dos uploads com confiança e status.
- **Métricas no topo**: total, validados humanos, precisão, confiança média, melhoria_pct (de `ai-validate?quality=1`).

## Service
`src/services/learningService.ts`: `uploadLearningFile`, `extractTextFromFile`, `waitForOcr`, `processWithAI`, `markExtractionAsLearning`, `listPendingExtractions`, `listLearningExtractions`, `saveGroundTruth`, `markAsCorrect`, `detectFileKind`.

Aceita: pdf, png/jpg/webp/gif/bmp/tiff, csv, txt, log, xlsx/xls/xlsm. Limite 50 MB.
