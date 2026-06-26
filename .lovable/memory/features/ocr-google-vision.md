---
name: ocr-google-vision
description: OCR de produção via Google Vision DOCUMENT_TEXT_DETECTION (PDF + imagem) com normalização e extração estruturada
type: feature
---
Engine padrão: Google Vision API (`google_vision`) substitui Tesseract em produção.
Edge function: `supabase/functions/ocr-google-vision/index.ts` — auth via Service Account JWT (secret `GOOGLE_VISION_CREDENTIALS` JSON), token OAuth cacheado em memória.
Endpoints Vision: `images:annotate` (PNG/JPG) e `files:annotate` (PDF, até 5 páginas síncronas; usar async batch para volumes maiores).
Feature usada: `DOCUMENT_TEXT_DETECTION` (NUNCA `textDetection`).
Saída: `{ text (normalizado), rawText, confidence, pageCount, structure: {blocks, paragraphs, words, lines[]}, durationMs }`.
Normalização obrigatória: `l→1`, `O→0` antes de dígitos, `R$ l → R$ 1`, colapso de espaços (corrige tabelas/balancete/comprovantes).
Extração estruturada percorre `pages → blocks → paragraphs → words → symbols` para preservar layout (tabelas, balancete, layout bancário).
Persistência opcional: tabela `ocr_results` (document_id, rma_id, engine, raw_text, normalized_text, confidence, structure jsonb, page_count). RLS: admins (gestor_ia/coordenador) full, consultor read-only.
Pipeline: OneDrive → Download → ocr-google-vision → normalize → audit-parse-pdf/classificação → agente.
UI Gestão de Agentes OCR (`/gestao-agentes-ocr`): default `google_vision`, opções tesseract/google_vision/multi.
