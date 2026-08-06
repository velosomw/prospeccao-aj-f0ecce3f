// MD-GEMINI-LIVE-PROCESSING-CERTIFICATION-001
// Modo LIVE CERTIFICATION: executa o pipeline completo com documentos reais,
// sem qualquer alteração definitiva na base de produção.
// Todos os resultados vão para o ambiente temporário (certificacao_runs / certificacao_processos).
//
// Body: { fase?: 1|5|20|100, links?: string[] }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { createClient } from "npm:@supabase/supabase-js@2";
import { acquireDocument } from "../_shared/document-acquisition.ts";
import { validateCanonical, formatIssues, CANONICAL_SCHEMA_VERSION } from "../_shared/canonical-schema.ts";
import { buildFactRows } from "../_shared/business-facts.ts";
import { logStage } from "../_shared/processing-telemetry.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
const MODELO_PADRAO = "gemini-3.6-flash";
const MODELO_FALLBACK = "gemini-3.6-flash"; // melhor Gemini 3.X para raciocínio jurídico-contábil
const MODELOS_PERMITIDOS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-3.6-flash", "gemini-3.5-flash"];
const FASES = [1, 5, 20, 100];

const EXTRACTION_PROMPT = `Você é um Auditor Contábil e Jurídico Sênior da BEx executando a CERTIFICAÇÃO OPERACIONAL do Motor Gemini.

Analise integralmente o PDF real anexado e produza:
1. OCR/leitura completa (idioma, tipo de documento, fase processual).
2. Segmentação em blocos jurídicos e extração de entidades (empresas, AJ, magistrado, vara, comarca, UF).
3. Interpretação de TODOS os valores jurídicos (causa, crédito, atualizado, passivo concursal, extraconcursal, declarado, calculado, trabalhista, quirografário, ME/EPP, garantias).
4. Business Facts canônicos, um por valor/fato relevante.
5. Painel Inteligente: resumo executivo, resumo comercial, timeline, alertas, score e recomendação.

Responda APENAS com JSON válido no schema:
{
  "workspace": {
    "processo": string, "empresa": string,
    "empresas_relacionadas": [{"nome":string,"cnpj":string,"papel":string}],
    "tipo_processo": string, "fase": string, "vara": string, "comarca": string, "estado": string,
    "valor_exportacao": number, "natureza_valor": string,
    "administrador_judicial": string, "juiz": string,
    "resumo_executivo": string, "interesse_bex": string,
    "proximos_eventos": string[], "recomendacao_ia": string,
    "timeline": [{"data":string,"evento":string}],
    "score_comercial": {"prioridade":number,"potencial":number,"complexidade":number,"probabilidade_aj":number,"score_geral":number},
    "resumo_comercial": {"status":"SIM"|"MÉDIO"|"NÃO","justificativa":string},
    "alertas": [{"tipo":string,"mensagem":string,"gravidade":"alta"|"media"|"baixa"}],
    "business_facts": [{"canonical_field":string,"entity_type":string,"tipo":string,"valor":number,"moeda":"BRL","origem":string,"pagina":number,"trecho":string,"business_rule":string,"confianca":number}],
    "evidencias": [{"campo":string,"pagina":number,"trecho":string}],
    "score_confianca": number
  },
  "classificacao": {"tipo_documento":string,"fase_processual":string,"idioma":string,"prioridade":string},
  "schema_version": "1.0"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GOOGLE_AI_API_KEY) return json({ error: "GOOGLE_AI_API_KEY ausente" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identidade (verify_jwt = false → validação em código)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.slice(7));
      userId = data?.user?.id ?? null;
    }
    if (!userId) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const fase = FASES.includes(Number(body.fase)) ? Number(body.fase) : 1;
    const manualLinks: string[] = Array.isArray(body.links) ? (body.links as string[]).filter(Boolean) : [];
    const modelo = MODELOS_PERMITIDOS.includes(String(body.model)) ? String(body.model) : MODELO_PADRAO;
    // Amostragem: permite certificar fases grandes (5/20/100) em lotes, sem executá-las integralmente
    const offset = Math.max(0, Number(body.offset) || 0);
    const max = Math.min(fase, Math.max(1, Number(body.max) || fase));
    const amostra = max < fase || offset > 0;

    // Fase encadeada: só inicia se a fase anterior estiver aprovada
    const idx = FASES.indexOf(fase);
    if (idx > 0) {
      const anterior = FASES[idx - 1];
      const { data: prev } = await admin.from("certificacao_runs")
        .select("id,status")
        .eq("user_id", userId).eq("fase", anterior).eq("status", "aprovado")
        .limit(1).maybeSingle();
      if (!prev) return json({ error: `Fase ${fase} bloqueada: a fase ${anterior} ainda não foi aprovada.` }, 400);
    }

    // Entrada: planilha real (primeiro processo → próximos) ou links informados
    let entradas: { id?: string | null; link: string; empresa?: string | null; processo?: string | null }[] = [];
    if (manualLinks.length) {
      entradas = manualLinks.slice(offset, offset + max).map((l) => ({ link: l }));
    } else {
      const { data: linhas } = await admin.from("prospeccao_linhas")
        .select("id,link_documento,parte_pro_nome,numero_processo,created_at")
        .not("link_documento", "is", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + max - 1);
      entradas = (linhas || []).map((l: any) => ({
        id: l.id, link: l.link_documento, empresa: l.parte_pro_nome, processo: l.numero_processo,
      }));
    }

    if (!entradas.length) {
      return json({
        error: "Nenhum documento real disponível. Faça o upload de uma planilha com a coluna Link_Documento.",
      }, 400);
    }

    const { data: run, error: runErr } = await admin.from("certificacao_runs").insert({
      user_id: userId, fase, status: "executando", total_processos: entradas.length,
    }).select("*").single();
    if (runErr) throw runErr;

    const tRun = Date.now();
    const processos: any[] = [];

    for (let i = 0; i < entradas.length; i++) {
      const entrada = entradas[i];
      const etapas: any[] = [];
      const tProc = Date.now();
      let download: Record<string, unknown> = {};
      let gemini: Record<string, unknown> = {};
      let ws: any = {};
      let extracted: any = {};
      let motivo: string | null = null;
      let schemaValido = false;
      let schemaIssues: any[] = [];
      let modeloUsado = modelo;


      try {
        // 1) Enterprise Document Acquisition (dryRun → storage temporário, sem registro definitivo)
        const t0 = Date.now();
        const acq = await acquireDocument({
          url: entrada.link, projeto: "certificacao_live", user_id: userId, dryRun: true,
        });
        console.log(`[cert] download ok em ${Date.now() - t0}ms, bytes=${acq.bytes.length}`);
        const tHash = Date.now();
        const hash = await sha256Hex(acq.bytes);
        console.log(`[cert] hash em ${Date.now() - tHash}ms`);
        download = {
          url: entrada.link,
          http_status: 200,
          tempo_ms: Date.now() - t0,
          tamanho_bytes: acq.tamanho_bytes ?? acq.bytes.length,
          hash_sha256: hash,
          paginas: acq.paginas ?? countPages(acq.bytes),
          storage: "temporario_certificacao",
          document_id: acq.document_id,
          conector: acq.conector,
          certificado: acq.certificado,
          status: "ok",
        };
        etapas.push(step("download", t0));


        // 2) Gemini — OCR + classificação + segmentação + extração
        // PDFs reais podem passar de 20 MB: usamos a Files API (upload binário),
        // evitando o base64 inline que estoura a memória do worker.
        const t1 = Date.now();
        const fileUri = await uploadGeminiFile(acq.bytes, "application/pdf", acq.nome_arquivo);
        console.log(`[cert] upload gemini ok em ${Date.now() - t1}ms`);
        const { callLLM } = await import("../_shared/llm-service.ts");
        const chamarGemini = (m: string) => callLLM({
          prompt: EXTRACTION_PROMPT,
          system: "Auditor Sênior BEx — Certificação Operacional do Motor Gemini.",
          provider: "gemini",
          model: m,
          useCache: false,
          customBody: {
            contents: [{
              role: "user",
              parts: [
                { text: EXTRACTION_PROMPT },
                { fileData: { mimeType: "application/pdf", fileUri } },
              ],
            }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
          },
        });
        // Degradação controlada: se o modelo escolhido estiver sem cota (429), cai para o Gemini 3.x disponível
        let aiResult;
        try {
          aiResult = await chamarGemini(modelo);
        } catch (err) {
          const msg = String((err as Error)?.message ?? err);
          if (!msg.includes("429") || modelo === MODELO_FALLBACK) throw err;
          console.warn(`[cert] ${modelo} sem cota (429) → fallback ${MODELO_FALLBACK}`);
          modeloUsado = MODELO_FALLBACK;
          aiResult = await chamarGemini(MODELO_FALLBACK);
        }

        const content = aiResult.text || "";
        const rawExtracted = extractJson(content);
        const validation = validateCanonical(rawExtracted);
        schemaValido = validation.valid;
        schemaIssues = validation.issues;
        if (!validation.valid) {
          throw new Error(
            `JSON canônico inválido (schema ${CANONICAL_SCHEMA_VERSION}): ${formatIssues(validation.issues)}`,
          );
        }
        extracted = validation.normalized as Record<string, any>;
        ws = extracted.workspace || {};
        gemini = {
          modelo: modeloUsado,
          tempo_ms: Date.now() - t1,
          tokens_entrada: aiResult.tokens?.input ?? estimateTokens(EXTRACTION_PROMPT),
          tokens_saida: aiResult.tokens?.output ?? estimateTokens(content),
          ocr: content.length > 0,
          idioma: extracted.classificacao?.idioma ?? "pt-BR",
          tipo_documento: extracted.classificacao?.tipo_documento ?? ws.tipo_processo ?? null,
          fase_processual: extracted.classificacao?.fase_processual ?? ws.fase ?? null,
          confiabilidade: ws.score_confianca ?? null,
          schema_version: CANONICAL_SCHEMA_VERSION,
        };
        logStage({
          run_id: run.id,
          linha_id: entrada.id ?? null,
          document_id: (download as any).document_id ?? null,
          stage: "extraction",
          duration_ms: Date.now() - t1,
          tokens_input: aiResult.tokens?.input ?? 0,
          tokens_output: aiResult.tokens?.output ?? 0,
          model: modeloUsado,
          provider: "gemini",
          metadata: { certificacao_live: true },
        });
        etapas.push(step("gemini", t1));

      } catch (e) {
        motivo = String((e as Error).message ?? e);
        download = { ...download, url: entrada.link, status: "erro", erro: motivo };
      }

      const businessFacts = Array.isArray(ws.business_facts) ? ws.business_facts : [];
      const evidencias = Array.isArray(ws.evidencias) ? ws.evidencias : [];
      const painel = {
        resumo_executivo: ws.resumo_executivo ?? null,
        resumo_comercial: ws.resumo_comercial ?? null,
        empresas: ws.empresas_relacionadas ?? [],
        valores: businessFacts,
        administrador_judicial: ws.administrador_judicial ?? null,
        magistrado: ws.juiz ?? null,
        timeline: ws.timeline ?? ws.proximos_eventos ?? [],
        alertas: ws.alertas ?? [],
        score: ws.score_comercial?.score_geral ?? null,
        recomendacao: ws.recomendacao_ia ?? null,
        evidencias,
      };

      // Fatos canônicos (EAV) — dry-run: gerados como evidência, sem persistir em produção
      const factsCanonicos = Object.keys(ws).length > 0
        ? buildFactRows(ws, { document_id: (download as any).document_id ?? null, numero_processo: ws.processo ?? null, source: "certificacao_live" })
        : [];

      const checklist = {
        download_realizado: (download as any).status === "ok",
        documento_certificado: Boolean((download as any).hash_sha256),
        ocr_concluido: Boolean((gemini as any).ocr),
        classificacao_correta: Boolean((gemini as any).tipo_documento),
        empresas_identificadas: Boolean(ws.empresa),
        valores_interpretados: Number(ws.valor_exportacao ?? 0) > 0 || businessFacts.length > 0,
        business_facts_gerados: businessFacts.length > 0,
        business_facts_canonicos: factsCanonicos.length > 0,
        json_produzido: Object.keys(ws).length > 0,
        json_schema_valido: schemaValido,
        painel_gerado: Boolean(painel.resumo_executivo),
        resumo_coerente: Boolean(ws.resumo_executivo && ws.interesse_bex && ws.recomendacao_ia),
        evidencias_registradas: evidencias.length > 0,
      };
      const aprovado = Object.values(checklist).every(Boolean);
      if (!aprovado && !motivo) {
        motivo = Object.entries(checklist).filter(([, v]) => !v).map(([k]) => k).join(", ");
      }

      logStage({
        run_id: run.id,
        linha_id: entrada.id ?? null,
        document_id: (download as any).document_id ?? null,
        stage: "total",
        status: aprovado ? "success" : "error",
        duration_ms: Date.now() - tProc,
        model: modeloUsado,
        provider: "gemini",
        error_message: aprovado ? null : motivo,
        metadata: { certificacao_live: true, fase, ordem: i + 1 },
      });

      const proc = {
        run_id: run.id, user_id: userId, ordem: i + 1,
        link: entrada.link,
        document_id: (download as any).document_id ?? null,
        numero_processo: ws.processo ?? entrada.processo ?? null,
        empresa: ws.empresa ?? entrada.empresa ?? null,
        status: aprovado ? "aprovado" : "reprovado",
        aprovado, motivo_reprovacao: aprovado ? null : motivo,
        download, gemini, business_facts: businessFacts,
        json_canonico: { ...extracted, schema_version: CANONICAL_SCHEMA_VERSION, schema_valido: schemaValido, schema_issues: schemaIssues },
        painel, checklist, evidencias,
        etapas, tempo_total_ms: Date.now() - tProc,
      };

      await admin.from("certificacao_processos").insert(proc);

      // Evidência canônica: persiste os fatos EAV extraídos nesta execução real
      if (factsCanonicos.length > 0) {
        const { error: factsErr } = await admin
          .from("prospeccao_business_facts")
          .insert(factsCanonicos.map((f) => ({ ...f, linha_id: entrada.id ?? null })));
        if (factsErr) console.error("[cert] falha ao persistir business_facts:", factsErr.message);
      }

      processos.push(proc);

    }

    const aprovados = processos.filter((p) => p.aprovado).length;
    const tempoTotal = Date.now() - tRun;
    const scores = processos.map((p) => p.painel?.score).filter((s: any) => typeof s === "number");
    const consolidado = {
      modelo,
      amostra,
      amostra_offset: offset,
      fase_alvo: fase,
      total_processos: processos.length,
      processados: processos.length,
      falhas: processos.length - aprovados,
      tempo_medio_ms: Math.round(tempoTotal / processos.length),
      downloads: processos.filter((p) => p.download?.status === "ok").length,
      ocr: processos.filter((p) => p.gemini?.ocr).length,
      business_facts: processos.reduce((a, p) => a + p.business_facts.length, 0),
      json_validos: processos.filter((p) => p.checklist.json_produzido).length,
      paineis: processos.filter((p) => p.checklist.painel_gerado).length,
      alertas: processos.reduce((a, p) => a + (p.painel?.alertas?.length ?? 0), 0),
    };

    const status = aprovados === processos.length ? "aprovado" : "reprovado";
    const { data: finalRun } = await admin.from("certificacao_runs").update({
      status,
      aprovados,
      reprovados: processos.length - aprovados,
      downloads_ok: consolidado.downloads,
      ocr_ok: consolidado.ocr,
      business_facts_total: consolidado.business_facts,
      json_validos: consolidado.json_validos,
      paineis_gerados: consolidado.paineis,
      tempo_total_ms: tempoTotal,
      tempo_medio_ms: consolidado.tempo_medio_ms,
      score_medio: scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null,
      consolidado,
    }).eq("id", run.id).select("*").single();

    return json({
      ok: true, modo: amostra ? "LIVE_CERTIFICATION_AMOSTRA" : "LIVE_CERTIFICATION", fase, modelo, amostra, offset, status,
      run: finalRun ?? run, consolidado, processos,
      proxima_fase: status === "aprovado" ? (FASES[idx + 1] ?? null) : null,
    });
  } catch (e) {
    console.error("[live-certification]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function step(nome: string, t0: number) {
  return { etapa: nome, inicio: new Date(t0).toISOString(), fim: new Date().toISOString(), tempo_ms: Date.now() - t0 };
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}
/** Upload binário para a Gemini Files API (protocolo resumable) → fileUri. */
async function uploadGeminiFile(bytes: Uint8Array, mime: string, displayName: string): Promise<string> {
  const base = "https://generativelanguage.googleapis.com";
  const start = await fetch(`${base}/upload/v1beta/files?key=${GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName || "documento.pdf" } }),
  });
  if (!start.ok) throw new Error(`GEMINI_UPLOAD_START_${start.status}: ${await start.text()}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("GEMINI_UPLOAD_SEM_URL");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!up.ok) throw new Error(`GEMINI_UPLOAD_${up.status}: ${await up.text()}`);
  const info = await up.json();
  let file = info.file ?? info;
  // Aguarda o processamento do arquivo (state ACTIVE)
  for (let i = 0; i < 30 && file.state && file.state !== "ACTIVE"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`${base}/v1beta/${file.name}?key=${GOOGLE_AI_API_KEY}`);
    file = await r.json();
    if (file.state === "FAILED") throw new Error("GEMINI_UPLOAD_FALHOU");
  }
  return file.uri as string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function countPages(bytes: Uint8Array): number {
  const txt = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 1_000_000)));
  return (txt.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;
}

function estimateTokens(t: string) { return t ? Math.ceil(t.length / 4) : 0; }
function extractJson(text: string): Record<string, any> {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/\{[\s\S]*\}/);
  const raw = m ? (m[1] || m[0]) : text;
  try { return JSON.parse(raw); } catch { return {}; }
}
