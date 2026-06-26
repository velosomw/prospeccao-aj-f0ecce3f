---
name: Dynamic Context-Aware Prompt Builder
description: Builder per-empresa que monta prompt dinâmico (perfil + plano de contas + padrões históricos + contexto doc + regras anti-alucinação) com auto-seleção de modelo
type: feature
---

# Dynamic Prompt Builder (Context-Aware)

## Camadas
1. **Perfil empresa** — `companies` (sector, cnae, execution_year, period).
2. **Fatos validados** — `company_context` (top-N por weight).
3. **Plano de contas** — `chart_of_accounts` (company-specific → fallback template).
4. **Padrões históricos** — `account_mapping_cache` (descrição→conta, ordenado por hits).
5. **Documento atual** — type, layout, OCR confidence, source.

## Anti-alucinação (sempre injetado)
- Nunca inventar dados / inferir valores ausentes.
- Sem correspondência → `null` + `requires_review:true`.
- Consistência com histórico (mesma descrição → mesma conta).
- Caixa/Bancos = ATIVO; tarifas/IOF = despesa financeira; empréstimos = passivo.

## Modos adaptativos
- `conservative`: ocr_confidence < 0.6 → `gemini-2.5-pro`
- `enriched`: histórico ≥ 20 itens → pro p/ docs pesados (balancete/DRE), flash p/ resto
- `generic`: fallback → `gemini-3-flash-preview`

## Saída JSON estrita
`{ document_type, period, accounts[{name_original, standard_name, conta, tipo, valor, natureza, confidence, requires_review, justificativa}], totals, consistency_warnings[] }`

## Endpoints / Módulos
- `_shared/dynamic-prompt-builder.ts` → `buildDynamicPrompt(input)` + `buildAndCall(input, callLLM)`
- `POST /dynamic-prompt-build` → preview (default) ou `run:true` para executar com `callLLM` + cache semântico

## Otimizações
- Limites configuráveis: `maxAccounts=80`, `maxPatterns=40`, `maxFacts=12`, `maxTextChars=6000`.
- Reuso via `llm_response_cache` (SHA-256 prompt+system+model).
