---
name: Financeiro / Tokens Tab
description: Aba "Financeiro / Tokens" em /gestao-agentes — observabilidade de custo IA + GCP, edição de preços, diagnóstico retroativo
type: feature
---

# Aba Financeiro / Tokens (`/gestao-agentes`)

## Tabelas
- `ai_cost_config` — preços vigentes (provider, service único, label, custo /1k input/output, /req, /página, fixo, currency, active, notes).
- `ai_usage_logs` — uso real **append-only** (type, provider, service, document_id, tokens, requests, pages, cost_calculated, metadata). Sem UPDATE/DELETE policies (imutável).
- View `ai_cost_summary`, função `calculate_ai_cost` + trigger `trg_calculate_cost`, função `ai_cost_diagnostics`.

## Service
`src/services/gestorIaCostService.ts`:
- `fetchCostConfig`, `upsertCostConfig`, `fetchUsageLogs`.
- `fetchCostIndicators(period)` — agrega KPIs, breakdown, série mensal (12), últimos 6 meses, insights (zero-cost-com-tokens / concentração >60% / projeção Pro→Flash).
- `runCostDiagnostics()` — recalcula histórico criando logs `type='adjustment'` com delta. Guard-rail: ignora ratio > 10x.
- `logAiUsage(input)` — chamado por edge functions.
- `calculateCost()` — espelha o SQL.

## UI (`TabFinanceiroTokens.tsx`)
1. Header com seletor de período (mes/trimestre/semestre/ano/total) + Atualizar + Executar Diagnóstico (botão roxo).
2. 4 KPIs: Custo/Relatório, Custo/Balancete, Custo Total E2E (IA+Infra), Custo Médio/Execução.
3. Painel E2E colapsável (breakdown por agente + Subtotal IA + Infra + Total).
4. Gráficos: pizza por agente, área 12 meses, barras 6 meses (Recharts).
5. Tabela editável de preços (`ai_cost_config`) com inputs pt-BR e botão Salvar por linha.
6. Tabela GCP infra (compute/disk/bigquery/cloudsql/storage) — persistida em `localStorage` `bex.infraRows.v1`.
7. Painel de insights (critical/warning/info) com alerta·causa·ação.

## Persistência local
- `gestor.financeiro.period`
- `gestor.e2eDetail.open`
- `bex.infraRows.v1`

## RLS
- Leitura pública autenticada de config e logs.
- Escrita de preços restrita a `has_role(uid, 'gestor_ia')` quando a função/role existir; caso contrário libera autenticados (fallback).
- Logs imutáveis (sem UPDATE/DELETE).
