# Fluxo: Upload de Arquivos (Recuperanda → Plataforma → RMA)

Documento descritivo do caminho ponta-a-ponta de um documento enviado pela Recuperanda
até sua consolidação no RMA (Relatório Mensal de Atividades).

## Diagrama (Mermaid)

```mermaid
flowchart TD
    %% ===== 1. ORIGEM =====
    subgraph A[1. Recuperanda - Origem]
      A1[Usuário Recuperanda faz login]
      A2[Tela 'Meus Documentos' / 'Upload']
      A3[Seleciona pasta-alvo<br/>P01..P60 - dipFolders]
      A4[Envia arquivo<br/>PDF / XLSX / DOCX / SPED]
    end

    %% ===== 2. ONEDRIVE =====
    subgraph B[2. Camada OneDrive - Projeto RMA]
      B1[PUT /me/drive/root:/Projeto RMA/{Empresa}/{Ano}/{Mes}/{Pasta}/]
      B2[(OneDrive: arquivo gravado)]
    end

    %% ===== 3. DELTA / FILA =====
    subgraph C[3. Detecção de Mudança - Delta Engine]
      C1[monitor-onedrive<br/>varre empresas ativas]
      C2[onedrive-sync-rma<br/>+ delta-engine<br/>NEW / UPDATED / IGNORE]
      C3[(onedrive_files<br/>status=new/updated)]
      C4[Trigger SQL<br/>trg_enqueue_processing]
      C5[(processing_queue<br/>priority/attempts)]
    end

    %% ===== 4. WORKER =====
    subgraph D[4. Worker On-Demand / Diário]
      D1[process-queue<br/>claim N rows]
      D2{Tipo do arquivo}
      D3[xlsx-worker<br/>Graph Excel API]
      D4[sped-worker<br/>parser .txt]
      D5[ocr-google-vision<br/>+ ocr_cache SHA-256]
    end

    %% ===== 5. IA =====
    subgraph E[5. Pipeline de IA - ai-full-process]
      E1[Classifier + Router]
      E2[Agente especializado<br/>(12 agentes + fallback)]
      E3[ai-validate<br/>cross-doc + grounding]
      E4[(ai_extractions<br/>document_versions<br/>document_state)]
    end

    %% ===== 6. CONSOLIDAÇÃO =====
    subgraph F[6. Consolidação Contábil]
      F1[balancete-build incremental]
      F2[(balancete_consolidado<br/>bs_consolidado<br/>dre_consolidado<br/>fluxo_caixa_consolidado)]
      F3[cross-validate<br/>Ativo = Passivo + PL]
    end

    %% ===== 7. RMA =====
    subgraph G[7. Workspace RMA]
      G1[rma-analyze<br/>pipeline floor + completude]
      G2[(rma_period_analyses<br/>rma_monthly_snapshots)]
      G3[rma-doc-section-regenerate<br/>+ rma_section_evidences]
      G4[rma-doc-consolidate-docx<br/>Capa + Petição + 14 capítulos]
      G5[Parecer Final DOCX/PDF<br/>Coordenador/Magistrado]
    end

    A1 --> A2 --> A3 --> A4 --> B1 --> B2
    B2 --> C1 --> C2 --> C3 --> C4 --> C5 --> D1
    D1 --> D2
    D2 -- xlsx --> D3 --> E1
    D2 -- sped/txt --> D4 --> E1
    D2 -- pdf/img --> D5 --> E1
    E1 --> E2 --> E3 --> E4 --> F1 --> F2 --> F3 --> G1 --> G2 --> G3 --> G4 --> G5
```

## Etapas em texto

1. **Origem (Recuperanda)** — usuário com perfil *Recuperanda* envia o arquivo via tela
   `RecDocumentos` selecionando a pasta canônica (P01..P60 — ver `src/data/dipFolders.ts`).
2. **OneDrive** — o upload é gravado em `Projeto RMA/{Empresa}/{Ano}/{Mês}/{Pasta}`
   via conector `microsoft_onedrive` (Graph API `PUT /content`).
3. **Delta Engine** — `monitor-onedrive` + `onedrive-sync-rma` classificam o arquivo
   como `NEW` / `UPDATED` / `IGNORE` comparando `etag/last_modified` com `onedrive_files`.
   O trigger SQL `trg_enqueue_processing` insere automaticamente em `processing_queue`.
4. **Worker** — `process-queue` (modo *on-demand* ou *daily*) consome a fila e roteia:
   - `.xlsx` → `xlsx-worker` (Graph Excel API, streaming até 32MB+)
   - `.txt` SPED → `sped-worker`
   - `.pdf/.jpg/.png` → `ocr-google-vision` (com `ocr_cache` por SHA-256).
5. **Pipeline IA** — `ai-full-process` executa Classifier → Agente especializado → Validador.
   Persiste em `ai_extractions`, versiona em `document_versions` e atualiza `document_state`.
6. **Consolidação** — `balancete-build` (incremental) preenche
   `balancete_consolidado / bs_consolidado / dre_consolidado / fluxo_caixa_consolidado`.
   `cross-validate` valida Ativo = Passivo + PL e consistência cross-doc.
7. **RMA** — `rma-analyze` calcula completude e "pipeline floor". `rma-doc-section-regenerate`
   cria evidências por seção (`rma_section_evidences`) e `rma-doc-consolidate-docx` gera
   o DOCX final (Capa + Petição ao Juízo + 14 capítulos) que vai ao Parecer Final.

## Pontos de governança
- **Auditoria**: cada passo grava em `pipeline_logs` / `platform_audit_log` / `rma_section_audit_log` (WORM).
- **Cache**: `ocr_cache` (hash) + `llm_response_cache` (TTL 30 dias) evitam reprocessar.
- **Retry**: `processing_queue.max_attempts=3`; falhas determinísticas viram `manual_upload_required`
  e aparecem em **RMA Correção → Arquivos com erro** para reupload pela Recuperanda.
- **Visibilidade**: Recuperanda vê status (Validado/Incompleto/Vazio) em `RecDocumentos`;
  Consultor/Coordenador acompanham em `RMAWorkspace` (abas Processamento, Auditoria, Relatório).
