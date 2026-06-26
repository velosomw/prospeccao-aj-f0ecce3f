// MD MASTER — Arquitetura completa: Gestor IA + OCR + Agentes + Multi-Cloud
// 12 fases (MD 1..16), agrupadas em blocos do pipeline ponta-a-ponta.

export type ArchPhase = {
  id: string;
  md: string;            // ex: "MD 1"
  phase: string;         // ex: "FASE 1"
  color: string;         // tailwind class for accent (hsl)
  title: string;
  goal: string;
  endpoint?: string;
  payload?: string;      // JSON example as string
  notes?: string[];
};

export const ARCH_BLOCKS: { key: string; label: string; phases: ArchPhase[] }[] = [
  {
    key: "ingest",
    label: "1. Ingestão Multi-Cloud",
    phases: [
      {
        id: "google_drive",
        md: "MD 1",
        phase: "FASE 1",
        color: "hsl(152,70%,45%)",
        title: "Integração Google Drive API",
        goal: "Capturar arquivos automaticamente da conta Google do cliente.",
        endpoint: "POST /ingest/google",
        payload: `{
  "file_id": "1abc",
  "name": "pix.png",
  "path": "/Financeiro/Transacoes",
  "mime_type": "image/png"
}`,
        notes: [
          "Escopo: drive.readonly",
          "Webhook ou polling de pasta",
          "Mapear pasta → agente especializado",
        ],
      },
      {
        id: "onedrive",
        md: "MD 2",
        phase: "FASE 2",
        color: "hsl(217,91%,50%)",
        title: "Integração Microsoft Graph (OneDrive)",
        goal: "Fonte primária. Captura via Change Notifications.",
        endpoint: "POST /ingest/onedrive",
        payload: `{
  "file_id": "xyz",
  "path": "/Financeiro/Contabil",
  "name": "balancete.pdf"
}`,
        notes: [
          "Conector já implementado: Projeto RMA / 03-2026",
          "Webhook = Microsoft Graph Change Notifications",
        ],
      },
    ],
  },
  {
    key: "queue",
    label: "2. Orquestração",
    phases: [
      {
        id: "queues",
        md: "MD 3",
        phase: "FASE 3",
        color: "hsl(38,90%,55%)",
        title: "Filas (RabbitMQ / SQS)",
        goal: "Desacoplar processamento e garantir resiliência.",
        payload: `queues:
  - ingest_queue
  - ocr_queue
  - classify_queue
  - extract_queue
  - validate_queue
  - antifraud_queue`,
        notes: ["Mensagem mínima: { document_id, step }"],
      },
    ],
  },
  {
    key: "ocr",
    label: "3. OCR + IA Pipeline",
    phases: [
      {
        id: "ocr",
        md: "MD 4",
        phase: "FASE 4",
        color: "hsl(280,70%,55%)",
        title: "Worker OCR",
        goal: "Extração textual com fallback Tesseract.",
        endpoint: "POST /ocr/process",
        payload: `{ "text": "...", "confidence": 0.92 }`,
        notes: ["Principal: Google Vision API", "Fallback: Tesseract local"],
      },
      {
        id: "classify",
        md: "MD 5",
        phase: "FASE 5",
        color: "hsl(217,91%,50%)",
        title: "Classificador",
        goal: "Identifica a classe do documento.",
        endpoint: "POST /ai/classify",
        payload: `// in
{ "text": "...", "file_type": "pdf" }
// out
{ "classe": "PIX", "confianca": 0.95 }`,
      },
      {
        id: "agents",
        md: "MD 6",
        phase: "FASE 6",
        color: "hsl(217,91%,50%)",
        title: "Agentes Especializados",
        goal: "Extração estruturada por agente (PIX, balancete, boleto…).",
        endpoint: "POST /ai/extract/{agent}",
        payload: `// ex: POST /ai/extract/financeiro_transacional
{ "text": "...", "classe": "PIX" }
→
{ "data": {...}, "confianca": 0.91 }`,
      },
      {
        id: "validate",
        md: "MD 7",
        phase: "FASE 7",
        color: "hsl(152,70%,45%)",
        title: "Validador (anti-alucinação)",
        goal: "Confere dados extraídos contra texto OCR.",
        endpoint: "POST /ai/validate",
      },
      {
        id: "analyze",
        md: "MD 8",
        phase: "FASE 7",
        color: "hsl(152,70%,45%)",
        title: "Analista (insights)",
        goal: "Insights, anomalias e padrões.",
        endpoint: "POST /ai/analyze",
      },
      {
        id: "antifraud",
        md: "MD 9",
        phase: "FASE 8",
        color: "hsl(0,70%,55%)",
        title: "Antifraude",
        goal: "Score de risco 0..1 cruzando documentos.",
        endpoint: "POST /ai/antifraud",
      },
    ],
  },
  {
    key: "storage",
    label: "4. Armazenamento",
    phases: [
      {
        id: "postgres",
        md: "MD 10",
        phase: "FASE 9",
        color: "hsl(217,91%,50%)",
        title: "PostgreSQL (documents + extracted_data)",
        goal: "Tabelas relacionais para dados estruturados.",
        payload: `documents (
  id UUID, file_name TEXT, source TEXT, path TEXT,
  status TEXT, created_at TIMESTAMP
)

extracted_data (
  id UUID, document_id UUID,
  json_data JSONB, confidence FLOAT
)`,
        notes: [
          "Já mapeado em pipeline_documents (BEx Cloud)",
        ],
      },
      {
        id: "vector",
        md: "MD 11",
        phase: "FASE 9",
        color: "hsl(280,70%,55%)",
        title: "Vector DB (pgvector)",
        goal: "Embeddings para busca semântica e auditoria.",
        payload: `document_embeddings (
  id UUID, document_id UUID,
  embedding VECTOR
)`,
        notes: ["Já provisionado: tabela document_embeddings + RPC search_documents"],
      },
    ],
  },
  {
    key: "api",
    label: "5. API & Dashboard",
    phases: [
      {
        id: "api",
        md: "MD 12",
        phase: "FASE 10",
        color: "hsl(217,91%,50%)",
        title: "API Layer",
        goal: "Endpoints públicos para o front.",
        payload: `GET  /documents
GET  /documents/{id}
GET  /documents/{id}/analysis
POST /search`,
      },
      {
        id: "dashboard",
        md: "MD 13",
        phase: "FASE 11",
        color: "hsl(38,90%,55%)",
        title: "Dashboard IA (BEx)",
        goal: "Documentos, análises, alertas, busca semântica.",
        notes: ["Tabela", "JSON viewer", "Gráficos", "Filtros por status/risco"],
      },
    ],
  },
  {
    key: "learning",
    label: "6. Evolução & Aprendizado",
    phases: [
      {
        id: "dataset",
        md: "MD 14",
        phase: "FASE 12",
        color: "hsl(280,70%,55%)",
        title: "Dataset Sintético",
        goal: "Variações + OCR ruim + ground truth.",
      },
      {
        id: "training",
        md: "MD 15",
        phase: "FASE 12",
        color: "hsl(280,70%,55%)",
        title: "Treino de Prompts",
        goal: "Pares input (texto OCR) → output (JSON correto).",
        payload: `{
  "input": "texto OCR",
  "output": "JSON correto"
}`,
      },
      {
        id: "loop",
        md: "MD 16",
        phase: "FASE FINAL",
        color: "hsl(0,70%,55%)",
        title: "Learning Loop (IA Evolutiva)",
        goal: "Correções humanas → atualização contínua de prompts.",
        notes: ["Usuário corrige → sistema aprende → re-aplica"],
      },
    ],
  },
];

// High-level data-flow nodes (for the master diagram)
export const ARCH_FLOW_NODES = [
  { id: "gdrive", label: "Google Drive", group: "ingest" },
  { id: "onedrive", label: "OneDrive (Graph)", group: "ingest" },
  { id: "ingest", label: "Ingest Service", group: "queue" },
  { id: "queue", label: "Queue (SQS/RabbitMQ)", group: "queue" },
  { id: "ocr", label: "OCR Worker", group: "ocr" },
  { id: "classifier", label: "Classificador", group: "ocr" },
  { id: "agents", label: "Agentes Especializados", group: "ocr" },
  { id: "validator", label: "Validador", group: "ocr" },
  { id: "analyzer", label: "Análise", group: "ocr" },
  { id: "antifraud", label: "Antifraude", group: "ocr" },
  { id: "postgres", label: "PostgreSQL", group: "storage" },
  { id: "vector", label: "Vector DB", group: "storage" },
  { id: "api", label: "API Layer", group: "api" },
  { id: "dash", label: "Dashboard / Gestor IA", group: "api" },
];
