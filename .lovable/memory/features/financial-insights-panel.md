---
name: Financial Insights Panel (Fase 3)
description: Componente FinancialInsightsPanel calcula KPIs (Liquidez, Endividamento, Margens, ROA/ROE, Capital de Giro) a partir de bs_consolidado + dre_consolidado. Plugado em RMABalancoTab, RMADRETab e aba Dashboards do workspace.
type: feature
---

**Arquivo**: `src/components/rma/FinancialInsightsPanel.tsx`
**Fonte de dados**: `useBSPNL(companyId, periodo, monthsBack=12, runToken)` — refetch automático quando rma-analyze conclui.
**KPIs calculados**: Liquidez Corrente (AC/PC), Liquidez Geral, Endividamento (PT/AT), Endividamento/PL, Capital Giro (AC-PC), Margem Bruta/EBITDA/Líquida, ROA, ROE.
**Gráficos**: Liquidez×Endividamento (Line), Margens (Area), Receita×EBITDA×Resultado (Bar), Composição Capital (Pie PC/PNC/PL).
**Alertas automáticos**: liquidez<1, endividamento>0.7, margem líquida<0, capital giro<0, margem EBITDA>0.15.
**Status colors**: good ≥1.5/≤0.5/≥10%, warn intermediário, bad limites críticos.
**Plugado em**: RMABalancoTab (após gráfico de evolução), RMADRETab (após gráficos), RMAWorkspace tab "dashboards" (acima de AuditCharts).
