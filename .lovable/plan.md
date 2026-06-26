# Plano: Novo fluxo Upload → IA → Planilha

## Objetivo
Reconfigurar a plataforma para o fluxo:
1. Usuário faz upload de **planilhas (Excel/CSV)** e/ou **PDFs** em `/treinar-ia` (Upload Planilha).
2. A planilha carregada é exibida e armazenada.
3. A IA percorre a coluna **`Link_Documento`**, baixa cada PDF externo, salva em pasta temporária no OneDrive.
4. A IA extrai dados do PDF (ex.: `228044_0019765-83.2026.8.16.0014`) e preenche/atualiza linhas da planilha exibida em `/consultor/relatorios` (Planilha).
5. Remover toda menção a **RMA**, **DIP** e **diplomata** da UI atual em uso.

---

## Etapa 1 — Limpeza de nomenclatura (UI ativa)
Remover/substituir nas páginas e componentes em uso:
- "RMA" → "Processo" (ou remover quando não fizer sentido)
- "DIP" → remover
- "Diplomata" → remover

Escopo restrito ao que está navegável hoje (sidebar + páginas vinculadas):
- `src/components/shell/AppSidebar.tsx`
- `src/pages/consultor/*` (Home, Relatorios, Clientes, Cadastro)
- `src/pages/TrainAI.tsx`
- `src/pages/ProcessoProspeccao.tsx`
- `src/pages/RMAWorkspace.tsx` (apenas títulos/labels visíveis das abas; lógica preservada)
- `src/components/consultor/PageShell.tsx`

Não alterar nomes de tabelas/colunas de banco neste momento (evita quebra). Apenas labels visíveis.

---

## Etapa 2 — Backend (Lovable Cloud)

### 2.1 Storage
Criar bucket privado `prospeccao-uploads` para receber planilhas e PDFs por sessão de upload.

### 2.2 Tabelas (migração)
- `prospeccao_uploads` — registra cada upload (id, user_id, company_id, file_name, file_type [xlsx|pdf], storage_path, status, created_at).
- `prospeccao_linhas` — linhas consolidadas da planilha exibida em `/consultor/relatorios`, com as colunas do arquivo `PROCESSOS_SERVICOS_ADM_JUDICIAL` + colunas extras preenchidas pela IA (campos do PDF).
- `prospeccao_pdf_jobs` — fila de PDFs detectados via `Link_Documento` (id, linha_id, link, status [pendente|baixado|extraido|erro], onedrive_path, extracted_json, error).

RLS: `authenticated` vê apenas seus próprios uploads; `gestor_ia`/`coordenador` veem tudo. GRANTs explícitos.

### 2.3 Edge Functions
- `prospeccao-upload` — recebe arquivo, salva no Storage, registra em `prospeccao_uploads`. Se `xlsx/csv`: parseia e insere em `prospeccao_linhas`, enfileira links em `prospeccao_pdf_jobs`. Se `pdf`: enfileira diretamente.
- `prospeccao-fetch-pdf` — worker que pega 1 job pendente, faz `fetch` do link externo, faz upload do PDF para OneDrive (pasta `Prospeccao/Temp/{job_id}.pdf`) via connector Microsoft OneDrive, marca `baixado`.
- `prospeccao-extract` — pega job `baixado`, envia PDF ao Lovable AI (`google/gemini-3-flash-preview`, modalidade file/PDF) com prompt + schema estruturado (campos do PDF judicial — partes, processo, vara, valores, datas, decisões), faz `UPDATE` em `prospeccao_linhas` correspondente e marca `extraido`.

Prompt/schema da extração será calibrado a partir do PDF de referência `228044_0019765-83.2026.8.16.0014 (2).pdf`.

---

## Etapa 3 — Frontend

### 3.1 Página `/treinar-ia` (Upload Planilha)
- Aceitar `.xlsx, .csv, .pdf` no dropzone.
- Mostrar lista de uploads recentes da sessão.
- Botão "Processar PDFs" → dispara worker `prospeccao-fetch-pdf` + `prospeccao-extract` para os jobs pendentes.
- Barra de progresso (X de Y PDFs extraídos).

### 3.2 Página `/consultor/relatorios` (Planilha)
- Substituir os 4 KPIs por: **Total Linhas**, **PDFs Pendentes**, **PDFs Extraídos**, **Erros**.
- Tabela passa a ler de `prospeccao_linhas` (e não mais do JSON estático).
- Botão "Atualizar" recarrega; coluna "Link_Documento" continua clicável; nova coluna "Status IA" (pendente/baixado/extraído/erro).

---

## Etapa 4 — Calibração da IA com o PDF de referência
Parsear `228044_0019765-83.2026.8.16.0014 (2).pdf` localmente para mapear quais campos extrair, e congelar o JSON Schema da extração. Os campos extraídos preencherão as colunas: Nº Processo, Partes, Órgão/Tribunal, UF, Valor Pleito, Datas, Status, etc.

---

## Detalhes técnicos
- Connector OneDrive já está documentado em mem (delegated OAuth). Reutilizar `_shared` helpers.
- AI: Lovable AI Gateway, modelo `google/gemini-3-flash-preview`, input multimodal `file` (PDF como data URL base64 vindo do Storage).
- Parser XLSX no Edge Function via `npm:xlsx`.
- Idempotência: hash do PDF (sha256) para evitar reextração.

---

## Confirmações necessárias antes de implementar
1. **Etapa 1 (limpeza de nomes)** — posso renomear "RMA Workspace" no topo e abas para "Processo / Workspace" mantendo a lógica interna?
2. **OneDrive temporário** — confirmar pasta base: `Prospeccao/Temp/`?
3. **Escopo de "remover DIP/diplomata"**: apenas labels visíveis ou também rotas/arquivos não usados? Sugiro só labels agora; limpeza de código morto em etapa separada.
4. Posso começar pela **Etapa 4 (parsear o PDF de referência e definir o schema de extração)** para validar os campos antes de mexer no banco?
