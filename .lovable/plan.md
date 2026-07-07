## Objetivo

Substituir "RMA" por "Prospecção AJ" (abreviação: "PAJ") em tudo que o usuário vê na plataforma.

## Escopo recomendado (executável com segurança)

Após mapear o código, encontrei ~100 arquivos e ~25 tabelas no banco (`rma_documents`, `rma_document_sections`, `rma_analysis_results`, `rma_monthly_snapshots`, `rma_cobrancas`, etc.) usando o prefixo `rma`. Uma renomeação total (tabelas + colunas + código + rotas) exigiria:

- reescrever ~40 edge functions,
- reescrever todas as políticas RLS,
- migrar dados de dezenas de tabelas,
- regenerar tipos e refatorar 100+ arquivos.

Isso é um esforço de vários dias com alto risco de quebrar auditoria, workspaces e o pipeline de IA. **Não recomendo fazer em um único passo.**

Proponho executar agora a **rebranding visível** (o que o usuário enxerga) e deixar a renomeação de banco/código como fase 2 opcional.

### O que muda nesta fase

**1. Textos visíveis na UI**
- Cabeçalhos, títulos de página, labels de menu, botões, tooltips, badges, mensagens de erro, e-mails, watermarks de PDF.
- Ex.: "Cadastro de RMA" → "Cadastro de Prospecção AJ", "RMAs Recebidos" → "Prospecções AJ Recebidas", "RMA Workspace" → "Workspace Prospecção AJ".
- Sigla curta "RMA" em KPIs/tags → "PAJ".

**2. Marca no header e no rodapé**
- "BEx RMA IA" → "BEx Prospecção AJ".
- `<title>` e `<meta description>` em `index.html`.

**3. Rotas visíveis**
- `/cadastro-rma` → `/cadastro-prospeccao-aj`
- `/magistrado/rmas` → `/magistrado/prospeccoes-aj`
- `/admjudicial/rmas` → `/admjudicial/prospeccoes-aj`
- `/dashboard/rma-workspace/:id` → `/dashboard/prospeccao-aj-workspace/:id`
- Redirects das URLs antigas para as novas (para não quebrar links salvos).

### O que fica igual (fase 2, sob demanda)

- Nomes de tabelas (`rma_documents`, `rma_cobrancas`, ...), colunas, tipos TypeScript (`RmaDocument`), hooks (`useRmaMonthlySnapshots`), componentes (`RMAStatusTab`), edge functions (`rma-doc-charts-build`).
- Motivo: são invisíveis ao usuário final e renomear agora traria alto risco de regressão sem benefício visual.

## Detalhes técnicos

- Rebrand textual via edits pontuais em arquivos JSX/TSX (não busca-e-substitui cega, para evitar quebrar nomes de componentes como `<RMAStatusTab />`).
- Novas rotas adicionadas em `src/App.tsx`; rotas antigas mantidas com `<Navigate replace>` para o novo caminho.
- Sidebar (`AppSidebar.tsx`) atualizada com os novos labels e paths.
- Nenhuma alteração no banco de dados nesta fase.

## Confirme antes de eu executar

Se aceitar, executo a fase 1 agora. Se quiser mesmo renomear tabelas/código internos (fase 2), me avise depois e faço um plano separado com migração de dados.
