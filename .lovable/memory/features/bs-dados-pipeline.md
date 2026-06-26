---
name: BS Dados Pipeline
description: Single source of truth — buildBSDados consolida balancete por Ref Capital BEX (47 chaves), 6 gráficos pixel-perfect Excel via ECharts, adapter consolidadoToParsed alimenta tudo a partir de balancete_consolidado.
type: feature
---
- Builder: src/services/bsDados/bsDadosBuilder.ts (REF1_MAP + AC/PC derivados + fallback regex + validações + CSV export UTF-8 BR).
- Tipos canônicos: BSDadosRow (DRE+Balanço+Endividamento), MonthlyDatum (consumido pelos gráficos).
- Sinais obrigatórios: receita +abs, cmv -abs, despesas -abs, resultado natural, dívidas +abs.
- 6 gráficos Excel BEX: CMV/RL, (CMV+Desp)/RL, Resultado/RL, EBITDA, Liquidez (LC/LS/LI/LG), Endividamento stack.
- Tema EXCEL_COLORS: azul #4F81BD, laranja #F79646, vermelho #C00000, verde #9BBB59, roxo #8064A2, ciano #4BACC6, amarelo #F2C200.
- Adapter consolidadoToParsed (src/services/bsDados/consolidadoAdapter.ts): converte rows do balancete_consolidado em ParsedFinancialData → builder.
- Hook: src/hooks/useConsolidadoBS.ts carrega balancete_consolidado por company_id.
- UI: TabBSDados (tabela + dívida + CSV) e AuditCharts (grid 2xN com 6 botões filtro: Todos, Ativo×Passivo, Clientes, Estoques, Despesas, DRE, Financeiro).
- RMAWorkspace: aba "BS & Dados" (roxo hsl 258 90% 66%) e aba "Gráficos de Auditoria" (renomeada de Dashboards).
