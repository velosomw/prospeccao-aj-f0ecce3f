---
name: Balancete Reformulation V2
description: MD técnico completo de reformulação da aba Balancete (schema D/C/saldo, pipeline balancete-build reescrito, DRE/FC automáticos, UI hierárquica Excel-like, validações estruturadas). Roadmap em 8 fases.
type: feature
---
**Decisões aprovadas pelo usuário:**
- Schema: adicionar `debito`/`credito`/`saldo` reais (migração + reescrever pipeline) — não derivar na UI.
- Escopo: pipeline + schema + UI + DRE + Fluxo de Caixa.
- Abas dependentes a refatorar: Validação Contábil, Auditoria & Lançamentos, BS & Dados.

**Schema novo (resumo):**
- `chart_of_accounts` += `codigo, grupo, subgrupo, categoria, natureza_dc`.
- `lancamentos` += `debito, credito, saldo (generated), natureza_dc, fonte_documento, confianca_global`.
- `balancete_consolidado` += `codigo, grupo, subgrupo, debito, credito, saldo (generated), confianca_media, fontes_documentos`.
- Novas: `dre_consolidado`, `fluxo_caixa_consolidado`, `balancete_validacoes`.

**Pipeline `balancete-build` (11 etapas):** OCR → IA → linhas (schema obrigatório com debito/credito/conta_sugerida/codigo_sugerido) → normalização (cache+regex+IA) → mapeamento 5-camadas → lancamentos → consolidação → DRE auto → FC auto → validações → reconciliação Ativo=Passivo+PL (tol 0,1%).

**Confiança:** `0.4*OCR + 0.3*IA + 0.3*mapeamento`. Lançamento `ok` se ≥0.7, senão `manual_review`.

**Validações estruturadas:** reconciliacao, saldo_negativo, baixa_confianca, duplicidade, dre_x_balanco, fluxo_x_disponivel.

**UI Preview Balancete:** hierárquica estilo Excel (Ativo→Circulante→Caixa) com expand/collapse, totais por grupo, colunas D/C/Saldo/Confiança/Fonte, filtros, ordenação, export CSV+PDF A4.

**Roadmap (8 fases):** F1 Schema ✅ → F2 Pipeline ✅ → F3 DRE/FC ✅ (backend `balancete-build` popula `dre_consolidado` e `fluxo_caixa_consolidado`; UI `RMADRETab` + `RMAFluxoCaixaTab` consomem via `useBSPNL`/`useFluxoCaixa`; aba "Fluxo de Caixa" em `StageProcessamentoIA`) → F4 Validações ✅ (BalanceteValidacoesHistorico) → F5 UI Pivot ✅ (TabPivotConsolidado) → F6 UI Validação+Auditoria → F7 BS&Dados adapter ✅ → F8 Learning loop (correções manuais → dataset_validated).

**Documento canônico:** `/mnt/documents/MD_Reformulacao_Balancete_RMA_v1.md`.
