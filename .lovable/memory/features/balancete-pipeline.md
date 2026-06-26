---
name: Pipeline Balancete RMA
description: Edge function balancete-build orquestra mês→OCR→ai-process→mapeamento→lancamentos→consolidado→reconciliação. Plano de contas template global XPT_BR_PADRAO_V1.
type: feature
---
**Edge function**: `balancete-build` (POST async com EdgeRuntime.waitUntil; GET ?run_id=).
**Pipeline**:
1. Lista pipeline_documents do RMA (modo flat: arquivos direto no mês).
2. Garante OCR via `ocr-google-vision` (idempotente: reutiliza ocr_results.completed).
3. Garante extração via `ai-process` (idempotente: reutiliza ai_extractions.completed; poll 60s para jobs assíncronos).
4. Extrai linhas via heurística defensiva: arrays {descricao, valor} em `linhas/contas/lancamentos/itens`. Para PIX/COMPROVANTE/BOLETO/BANK_RECEIPT cria 1 lançamento por doc.
5. **Mapeamento conta** (5 camadas): cache por empresa → conta sugerida pela IA exata no COA → descrição exata no COA → fuzzy Jaccard ≥0.5 → fallback "OUTROS".
6. Persiste em `lancamentos` (status=ok se confiança_mapeamento≥0.7, senão review). Atualiza `account_mapping_cache` com hits++.
7. Consolida em `balancete_consolidado` (agrega valor por conta×mês, joina tipo/nivel do COA via company OR template_name=XPT_BR_PADRAO_V1).
8. Reconcilia: Ativo = Passivo + PL com tolerância 0.1%. Marca `reconciled=true/false` e grava `reconciliation_notes`.

**Tabelas**: chart_of_accounts (template global) · lancamentos · balancete_consolidado · balancete_runs (estado/log/progresso) · account_mapping_cache.
**Path OneDrive**: `/Projeto RMA/{Empresa}/{Ano}/{MM.AAAA}/` (sem subpasta de categoria; IA classifica).
**onedrive-sync-rma**: aceita `month: 1-12` → monta `period = "MM.AAAA"`. Modo flat: cria pseudo-tópico "AUTO".
**Próxima fase (3)**: UI /rma/:id/balancete (Status · Validação · Preview · Auditoria) consumindo balancete_runs + balancete_consolidado.
