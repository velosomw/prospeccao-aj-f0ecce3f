// rma-analyze: orquestra a análise IA de um RMA Empresa.
//   1. Localiza a pasta da empresa em /Projeto RMA/{nome}/{ano}/ANUAL/
//   2. Lista subpastas (= tópicos) e arquivos
//   3. Faz OCR/extração contábil de PDFs/imagens via Gemini (audit-parse-pdf inline)
//   4. Consolida Balanço + DRE
//   5. Chama análise multi-agente (audit-analyze inline) → indicadores, Kanitz, Score
//   6. Persiste em rma_analysis_results
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ONEDRIVE_CONFIG,
  resolveRoot,
  listChildren,
  ensureFolder,
  validateFile,
  audit,
  getServiceClient,
} from "../_shared/onedrive.ts";
import { graphApp, getAppCreds, getAppToken } from "../_shared/graph-app.ts";
import { decideDelta, trackAndEnqueue, markProcessed } from "../_shared/delta-engine.ts";
import { buildPrevTopicMap, mergeTopics, computePercentual } from "../_shared/rma-snapshot.ts";
import { logGatewayUsage } from "../_shared/ai-telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
// Sem limite de arquivos: lê todos os arquivos OCR-áveis presentes na pasta.
// Para evitar 504 em pastas gigantes, usamos um teto de segurança alto e
// processamento sequencial com cache (rma_file_parse_cache reaproveita parses).
const MAX_FILES_PER_TOPIC = 1000; // teto de segurança apenas
const PARSE_MAX_BYTES = 12 * 1024 * 1024; // 12 MB por arquivo enviado à IA
// Tópicos processados por invocação (sub-job). O orquestrador re-invoca a si mesmo
// para o próximo chunk até concluir — evita "CPU Time exceeded" no edge runtime.
const CHUNK_TOPICS_PER_INVOCATION = 3;

// ───────────────────── helpers ─────────────────────

function jsonRepair(raw: string): any {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const i = s.indexOf("{");
  if (i === -1) throw new Error("sem JSON");
  s = s.slice(i);
  try { return JSON.parse(s); } catch {}
  s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
  try { return JSON.parse(s); } catch {}
  // fechamento mínimo
  let ob = 0, obk = 0, ins = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { ins = !ins; continue; }
    if (ins) continue;
    if (c === "{") ob++;
    else if (c === "}") ob--;
    else if (c === "[") obk++;
    else if (c === "]") obk--;
  }
  if (ins) s += '"';
  for (let k = 0; k < obk; k++) s += "]";
  for (let k = 0; k < ob; k++) s += "}";
  return JSON.parse(s);
}

async function downloadDriveItem(driveId: string, itemId: string): Promise<Uint8Array> {
  const token = await getAppToken();
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`Download falhou [${r.status}] item=${itemId}`);
  return new Uint8Array(await r.arrayBuffer());
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function normalizeTopicName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*(topico|tópico)?\s*0*\d{1,3}\s*[.)_\-/–—]*\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(de|da|do|das|dos|e|a|o|as|os|na|no|em|para|com)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leadingTopicNumber(value: string): number | null {
  const m = String(value || "").match(/^\s*(?:pasta|topico|tópico)?\s*[_-]?\s*0*(\d{1,3})(?:\D|$)/i);
  return m ? Number(m[1]) : null;
}

function topicMatchScore(a: string, b: string): number {
  const left = new Set(normalizeTopicName(a).split(" ").filter((w) => w.length > 2));
  const right = new Set(normalizeTopicName(b).split(" ").filter((w) => w.length > 2));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const word of left) if (right.has(word)) hits++;
  return hits / Math.max(left.size, right.size);
}

// Chama Lovable AI Gateway com PDF/imagem inline para extrair contas contábeis
const PARSE_PROMPT = `Você é parser contábil. Extraia todas as contas com valores numéricos do documento.
Responda APENAS JSON:
{
  "documentInfo": { "tipo": "balancete|balanco|dre|dfc|extrato|outro" },
  "balanco": [{ "conta":"", "descricao":"", "values": {"<ano>": <num>} }],
  "dre":     [{ "conta":"", "descricao":"", "values": {"<ano>": <num>} }]
}
Se não distinguir, coloque tudo em "balanco". Sem markdown.`;

// Timeout duro por chamada à IA — evita travar 1 arquivo eternamente
const PARSE_AI_TIMEOUT_MS = 30_000; // 30s por arquivo (reduzido p/ pular arquivos travados rápido)
// Timeout duro por tópico inteiro — garante que o loop continue mesmo se uma pasta engasgar
const TOPIC_TIMEOUT_MS = 240_000; // 4 min por tópico

async function parseDocumentWithAI(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<{ balanco: any[]; dre: any[]; tipo: string }> {
  const b64 = bytesToB64(bytes);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), PARSE_AI_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PARSE_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${b64}` },
              },
              { type: "text", text: `Extraia dados contábeis de ${fileName}` },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });
  } catch (e) {
    clearTimeout(tid);
    if ((e as any)?.name === "AbortError") throw new Error(`parse-ai timeout (>${PARSE_AI_TIMEOUT_MS / 1000}s) em ${fileName}`);
    throw e;
  }
  clearTimeout(tid);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`parse-ai ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  logGatewayUsage(j, { model: "google/gemini-2.5-flash", type: "extraction", metadata: { fn: "rma-analyze.parse", file: fileName } }).catch(() => {});
  const content = j.choices?.[0]?.message?.content || "";
  const out = jsonRepair(content);
  return {
    balanco: Array.isArray(out.balanco) ? out.balanco : [],
    dre: Array.isArray(out.dre) ? out.dre : [],
    tipo: out.documentInfo?.tipo || "outro",
  };
}

// ───────── Cache incremental por arquivo (Delta Engine + rma_file_parse_cache) ─────────
const PARSER_VERSION = "v1";

interface CachedParse {
  balanco: any[];
  dre: any[];
  tipo: string;
  fromCache: boolean;
}

/**
 * Tenta reaproveitar parse anterior; se inexistente OU etag mudou, parseia
 * de novo e grava no cache. Também atualiza onedrive_files (tracker) com o
 * status correto via Delta Engine.
 */
export interface IncrementalStats {
  cacheHits: number;       // etag/last_modified bateu — usou cache
  firstParse: number;      // arquivo sem cache anterior — parse legítimo
  updatedReparse: number;  // cache existia mas etag/last_modified mudou — reparse legítimo
  violations: number;      // cache válido existia mas mesmo assim reparseamos (BUG)
  violationDetails: string[];
}

async function getOrParseFile(opts: {
  sb: any;
  driveId: string;
  item: any; // Graph driveItem
  companyId: string;
  rmaId: string | null;
  ano: number;
  mes: number;
  topicNumber: number;
  topicName: string;
  topicPath: string;
  stats: IncrementalStats;
}): Promise<CachedParse> {
  const { sb, driveId, item, companyId, rmaId, ano, mes, topicNumber, topicName, topicPath, stats } = opts;
  const fileId: string = item.id;
  const etag: string | null = item.eTag || item.cTag || null;
  const lastModified: string | null = item.lastModifiedDateTime || null;
  const mime: string = item.file?.mimeType || "application/octet-stream";
  const fileName: string = item.name;
  const sizeBytes: number | null = typeof item.size === "number" ? item.size : null;

  // ─── INCREMENTAL HARDENING ───────────────────────────────────────────
  // 1) CACHE-FIRST: se já temos um parse anterior cujo etag/last_modified bate,
  //    devolve direto. Essa checagem precede o decideDelta porque trackers
  //    "processing" órfãos (de runs mortas) ou rows sem last_processed_at
  //    fariam o Delta Engine devolver "updated" indevidamente, causando
  //    re-download + re-IA mesmo com cache íntegro.
  const { data: cachedRow } = await sb
    .from("rma_file_parse_cache")
    .select("balanco,dre,tipo,etag,last_modified,hits")
    .eq("file_id", fileId)
    .eq("parser_version", PARSER_VERSION)
    .maybeSingle();

  const cachedEtagMatches = !!cachedRow && etag && (cachedRow as any).etag === etag;
  const cachedNotModified = !!cachedRow
    && lastModified
    && (cachedRow as any).last_modified
    && new Date(lastModified).getTime() <= new Date((cachedRow as any).last_modified).getTime();

  if (cachedRow && (cachedEtagMatches || cachedNotModified)) {
    stats.cacheHits++;
    // best-effort: bump hits + atualiza tracker para "processed" se ainda estiver órfão
    sb.from("rma_file_parse_cache")
      .update({ last_used_at: new Date().toISOString(), hits: ((cachedRow as any).hits ?? 0) + 1 })
      .eq("file_id", fileId)
      .eq("parser_version", PARSER_VERSION)
      .then(() => {});
    sb.from("onedrive_files")
      .update({ status: "processed", last_processed_at: new Date().toISOString(), error_message: null })
      .eq("file_id", fileId)
      .in("status", ["tracked", "processing", "error", "queued"])
      .then(() => {});
    return {
      balanco: Array.isArray((cachedRow as any).balanco) ? (cachedRow as any).balanco : [],
      dre: Array.isArray((cachedRow as any).dre) ? (cachedRow as any).dre : [],
      tipo: (cachedRow as any).tipo || "outro",
      fromCache: true,
    };
  }

  // ─── ASSERÇÃO INCREMENTAL ────────────────────────────────────────────
  // Se chegou aqui é porque cache não existe OU etag/last_modified mudaram.
  // Classificamos para auditoria — qualquer reparse de arquivo "inalterado"
  // (mesmo etag, mesmo last_modified) é uma VIOLAÇÃO do contrato incremental.
  if (!cachedRow) {
    stats.firstParse++;
  } else {
    const etagSame = etag && (cachedRow as any).etag === etag;
    const lmSame = lastModified
      && (cachedRow as any).last_modified
      && new Date(lastModified).getTime() === new Date((cachedRow as any).last_modified).getTime();
    if (etagSame && lmSame) {
      stats.violations++;
      const detail = `${fileName} (etag=${etag} lm=${lastModified}) — cache existe e bate, mas reparse foi acionado`;
      stats.violationDetails.push(detail);
      console.error(`[INCREMENTAL VIOLATION] ${detail}`);
    } else {
      stats.updatedReparse++;
    }
  }

  // 2) Sem cache válido → consulta tracker e roda Delta Engine para decidir versão
  const { data: existingTracker } = await sb
    .from("onedrive_files")
    .select("etag,last_modified,last_processed_at,version,status")
    .eq("file_id", fileId)
    .maybeSingle();

  const decision = decideDelta(
    {
      file_id: fileId,
      drive_id: driveId,
      path: `${topicPath}/${fileName}`,
      file_name: fileName,
      mime_type: mime,
      size_bytes: sizeBytes,
      etag,
      last_modified: lastModified,
      company_id: companyId,
      rma_id: rmaId,
      ano,
      mes,
    },
    existingTracker as any,
  );

  // 3) Marca tracker como queued/processing
  await sb.from("onedrive_files").upsert({
    file_id: fileId,
    drive_id: driveId,
    company_id: companyId,
    rma_id: rmaId,
    path: `${topicPath}/${fileName}`,
    file_name: fileName,
    mime_type: mime,
    size_bytes: sizeBytes,
    etag,
    last_modified: lastModified,
    last_seen_at: new Date().toISOString(),
    version: decision.next_version,
    status: "processing",
    ano,
    mes,
    metadata: { topic_number: topicNumber, topic_name: topicName },
  }, { onConflict: "file_id" });

  // 4) Parse real (download + IA)
  try {
    const bytes = await downloadDriveItem(driveId, fileId);
    const parsed = await parseDocumentWithAI(bytes, mime, fileName);

    // 5) Persiste cache
    await sb.from("rma_file_parse_cache").upsert({
      file_id: fileId,
      drive_id: driveId,
      company_id: companyId,
      rma_id: rmaId,
      ano,
      mes,
      topic_number: topicNumber,
      topic_name: topicName,
      file_name: fileName,
      mime_type: mime,
      size_bytes: sizeBytes,
      etag,
      last_modified: lastModified,
      parsed_at: new Date().toISOString(),
      parser_version: PARSER_VERSION,
      tipo: parsed.tipo,
      balanco: parsed.balanco,
      dre: parsed.dre,
      hits: 0,
      last_used_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "file_id,parser_version" });

    // 6) Marca tracker como processed (e zera contadores de falha)
    await sb.from("onedrive_files").update({
      status: "processed",
      last_processed_at: new Date().toISOString(),
      error_message: null,
      parse_attempts: 0,
      last_parse_error_at: null,
    }).eq("file_id", fileId);

    return { ...parsed, fromCache: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Incrementa contador de falhas de parse e, na 2ª falha, marca como
    // "Upload manual exigido" para que o RMA prossiga sem este arquivo.
    try {
      const { data: trk } = await sb
        .from("onedrive_files")
        .select("parse_attempts")
        .eq("file_id", fileId)
        .maybeSingle();
      const attempts = ((trk as any)?.parse_attempts ?? 0) + 1;
      if (attempts >= 2) {
        await sb.from("onedrive_files").update({
          status: "manual_upload_required",
          error_message: msg.slice(0, 500),
          parse_attempts: attempts,
          last_parse_error_at: new Date().toISOString(),
          requires_manual_upload: true,
          last_learning_error: msg.slice(0, 500),
        }).eq("file_id", fileId);
        await sb.rpc("mark_file_manual_upload_required", {
          p_file_id: fileId,
          p_reason: msg.slice(0, 500),
        });
      } else {
        await sb.from("onedrive_files").update({
          status: "error",
          error_message: msg.slice(0, 500),
          parse_attempts: attempts,
          last_parse_error_at: new Date().toISOString(),
        }).eq("file_id", fileId);
      }
    } catch (markErr) {
      console.error("[rma-analyze] falha ao marcar manual_upload:", markErr);
    }
    throw e;
  }
}

const ANALYZE_PROMPT = `Você é o motor de auditoria contábil multi-agente da BEx. Analise os dados consolidados e responda APENAS JSON:
{
  "diagnostico": { "riskLevel": "baixo|moderado|elevado|critico", "resumo": "..." },
  "indicadores": {
    "liquidezCorrente": 0, "liquidezSeca": 0, "liquidezGeral": 0, "liquidezImediata": 0,
    "endividamentoTotal": 0, "composicaoEndividamento": 0, "imobilizacaoPL": 0,
    "giroAtivo": 0, "pmr": 0, "pmp": 0, "giroEstoque": 0,
    "margemLiquida": 0, "margemOperacional": 0, "roe": 0, "roa": 0
  },
  "kanitz": { "fatorInsolvencia": 0, "classificacao": "solvente|penumbra|insolvente",
              "componentes": { "rpl":0, "lg":0, "ls":0, "lc":0, "ge":0 } },
  "scoreRJ": { "score": 0, "classificacao": "Saudável|Atenção|Alto Risco|Forte Indicativo de RJ" },
  "pendencias": [{ "tipo":"", "gravidade":"", "problema":"", "recomendacao":"" }],
  "alertas":    [{ "titulo":"", "descricao":"", "severidade":"" }]
}
Calcule Kanitz: FI = 0.05·X1 + 1.65·X2 + 3.55·X3 - 1.06·X4 - 0.33·X5
X1=LL/PL, X2=(AC+RLP)/(PC+ELP), X3=(AC-Estoques)/PC, X4=AC/PC, X5=-((PC+ELP)/PL)
Sem markdown.`;

async function analyzeWithAI(balanco: any[], dre: any[], empresa: string): Promise<any> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: ANALYZE_PROMPT },
        {
          role: "user",
          content:
            `Empresa: ${empresa}\n\n## BALANÇO\n${JSON.stringify(balanco).slice(0, 60000)}\n\n## DRE\n${JSON.stringify(dre).slice(0, 30000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`analyze-ai ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  logGatewayUsage(j, { model: "google/gemini-3-flash-preview", type: "generation", metadata: { fn: "rma-analyze.analyze", empresa } }).catch(() => {});
  return jsonRepair(j.choices?.[0]?.message?.content || "");
}

// ───────────────────── handler ─────────────────────

// @ts-ignore - EdgeRuntime é global no Supabase Edge runtime
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let companyId: string | null = null;
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const body = await req.json().catch(() => ({}));
    companyId = body.companyId;
    if (!companyId) throw new Error("companyId é obrigatório");

    const sb = getServiceClient();

    // ───── KILL SWITCH: respeita worker_config.enabled ─────
    // Se o worker global está desligado, NÃO inicia nem retoma análise.
    try {
      const { data: cfg } = await sb.from("worker_config").select("enabled").eq("id", "default").maybeSingle();
      if (cfg && cfg.enabled === false) {
        console.log(`[kill-switch] worker_config.enabled=false → rma-analyze abortado company=${companyId}`);
        return new Response(
          JSON.stringify({ success: false, error: "worker disabled", code: "WORKER_DISABLED" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      console.warn("[kill-switch] check falhou (seguindo):", (e as Error).message);
    }


    // Se body._resume=true + runToken, NÃO adquire novo lock — apenas valida
    // que o token ainda é dono via extend_rma_analysis_lock (idempotência).
    if (body._resume === true && body.runToken) {
      const lockToken = String(body.runToken);
      const { data: extOk, error: extErr } = await sb.rpc("extend_rma_analysis_lock", {
        p_company_id: companyId, p_token: lockToken, p_ttl_minutes: 8,
      });
      if (extErr || !extOk) {
        console.log(`[resume] rejected company=${companyId} token=${lockToken} err=${extErr?.message}`);
        return new Response(
          JSON.stringify({ success: false, error: "runToken inválido ou expirado", code: "RESUME_REJECTED" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(`[resume] company=${companyId} fromIndex=${body.resumeFromIndex ?? 0}`);
      const job = runAnalysis(companyId, body, lockToken);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(job);
      else job.catch((e) => console.error("runAnalysis resume bg:", e));
      return new Response(
        JSON.stringify({ success: true, resumed: true, companyId, fromIndex: body.resumeFromIndex ?? 0 }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ───── Trava de concorrência (lock distribuído com TTL) ─────
    // Garante idempotência: apenas UMA execução do rma-analyze por empresa
    // pode estar ativa. Se outra execução estiver rodando dentro do TTL,
    // retorna 409 Conflict imediatamente sem disparar nova run.
    const force = body.force === true || body.auto_retry === true;
    const lockHolder = `rma-analyze:${crypto.randomUUID().slice(0, 8)}`;
    const { data: lockResult, error: lockErr } = await sb.rpc(
      "acquire_rma_analysis_lock",
      {
        p_company_id: companyId,
        p_holder: lockHolder,
        p_ttl_minutes: 8,
        p_force: force,
      },
    );
    if (lockErr) throw new Error(`acquire_lock: ${lockErr.message}`);
    const lock = lockResult as any;
    if (!lock?.acquired) {
      console.log(`[lock] busy company=${companyId} holder=${lock?.holder} until=${lock?.locked_until}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Já existe uma análise em andamento para esta empresa.",
          code: "ANALYSIS_LOCKED",
          locked_until: lock?.locked_until,
          holder: lock?.holder,
          reason: lock?.reason,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const lockToken: string = lock.token;
    console.log(`[lock] acquired company=${companyId} token=${lockToken} reason=${lock.reason}`);

    // Pré-carrega os tópicos do cadastro para já mostrar a lista cinza imediatamente
    const { data: cTopicsInit } = await sb
      .from("company_rma_topics")
      .select("topic_number, topic_name")
      .eq("company_id", companyId)
      .order("topic_number");
    const initialGrayTopics = (cTopicsInit || []).map((t) => ({
      number: t.topic_number,
      name: t.topic_name,
      status: "pendente" as const,
      completude: 0,
      fileCount: 0,
      docsParsed: 0,
      errors: [] as string[],
      processing: false,
    }));

    // Watchdog: se houver run anterior travado em "em_analise" sem update há > 8 min,
    // marca como erro antes de iniciar nova análise. Isso evita que a UI fique presa
    // em "Em Análise" indefinidamente quando o edge runtime é morto por timeout/CPU.
    try {
      const { data: prev } = await sb
        .from("rma_analysis_results")
        .select("id, status, updated_at, topics")
        .eq("company_id", companyId)
        .maybeSingle();
      if (prev && (prev as any).status === "em_analise") {
        const ageMs = Date.now() - new Date((prev as any).updated_at).getTime();
        if (ageMs > 8 * 60 * 1000) {
          const cleaned = Array.isArray((prev as any).topics)
            ? (prev as any).topics.map((t: any) => ({ ...t, processing: false }))
            : [];
          await sb.from("rma_analysis_results").update({
            status: "erro",
            error_message: `Run anterior travado (sem update há ${Math.round(ageMs / 60000)} min) — substituído por nova execução`,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            topics: cleaned,
          }).eq("id", (prev as any).id);
          console.log(`watchdog: run anterior ${(prev as any).id} marcado como erro (idade=${Math.round(ageMs / 60000)}min)`);
        }
      }
    } catch (e) {
      console.error("watchdog falhou:", (e as Error).message);
    }

    // Watchdog de tracker: rows em "processing" há mais de 8 min são órfãs
    // (run anterior morta antes de marcar processed/error). Sem reset, o
    // Delta Engine vê status="processing" + last_processed_at=null e devolve
    // "updated" indevidamente — re-baixando + re-chamando IA.
    try {
      const cutoff = new Date(Date.now() - 8 * 60 * 1000).toISOString();
      await sb.from("onedrive_files")
        .update({ status: "tracked", error_message: "[watchdog] processing órfão liberado" })
        .eq("company_id", companyId)
        .eq("status", "processing")
        .lt("updated_at", cutoff);
    } catch (e) {
      console.error("watchdog tracker falhou:", (e as Error).message);
    }

    // Marca status inicial imediatamente para o front. Em modo incremental,
    // preserva o snapshot anterior dos tópicos (e o percentual) para a UI não
    // "zerar" durante uma re-execução — só atualiza o que de fato mudar.
    const { data: prevForSnapshot } = await sb
      .from("rma_analysis_results")
      .select("topics, percentual")
      .eq("company_id", companyId)
      .maybeSingle();
    const baseTopics = Array.isArray((prevForSnapshot as any)?.topics) && (prevForSnapshot as any).topics.length > 0
      ? (prevForSnapshot as any).topics.map((t: any) => ({ ...t, processing: false }))
      : initialGrayTopics;
    const basePercent = typeof (prevForSnapshot as any)?.percentual === "number" ? (prevForSnapshot as any).percentual : 0;

    await sb.from("rma_analysis_results").upsert({
      company_id: companyId,
      status: "em_analise",
      percentual: basePercent,
      topics: baseTopics,
      log: [`[${new Date().toISOString()}] Re-análise incremental — ${initialGrayTopics.length} tópicos (snapshot preservado)`],
      error_message: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });

    // Dispara processamento em background (não bloqueia a resposta)
    const job = runAnalysis(companyId, body, lockToken);
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(job);
    } else {
      // Fallback local: não aguarda
      job.catch((e) => console.error("runAnalysis bg:", e));
    }

    return new Response(
      JSON.stringify({ success: true, queued: true, companyId }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("rma-analyze enqueue:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ───────────────────── job (background) ─────────────────────
async function runAnalysis(companyId: string, body: any, lockToken?: string) {
  // Heartbeat: prolonga TTL do lock a cada 90s enquanto a run estiver viva.
  let heartbeatTimer: number | undefined;
  if (lockToken) {
    const sbHb = getServiceClient();
    heartbeatTimer = setInterval(async () => {
      try {
        await sbHb.rpc("extend_rma_analysis_lock", {
          p_company_id: companyId, p_token: lockToken, p_ttl_minutes: 8,
        });
      } catch (e) {
        console.error("[lock] heartbeat falhou:", (e as Error).message);
      }
    }, 90 * 1000) as unknown as number;
  }
  // Flag: quando true, mantém o lock vivo para o próximo sub-job (chunk) assumir.
  let keepLockForNextChunk = false;
  const releaseLock = async () => {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    if (!lockToken) return;
    if (keepLockForNextChunk) {
      console.log(`[lock] mantido para próximo chunk company=${companyId}`);
      return;
    }
    try {
      const sbRel = getServiceClient();
      await sbRel.rpc("release_rma_analysis_lock", {
        p_company_id: companyId, p_token: lockToken,
      });
      console.log(`[lock] released company=${companyId}`);
    } catch (e) {
      console.error("[lock] release falhou:", (e as Error).message);
    }
  };
  const startedAt = Date.now();
  const log: string[] = [];
  const incrementalStats: IncrementalStats = {
    cacheHits: 0, firstParse: 0, updatedReparse: 0, violations: 0, violationDetails: [],
  };
  try {
    const sb = getServiceClient();

    // 1. Carrega empresa + tópicos atribuídos
    const { data: company, error: cErr } = await sb
      .from("companies")
      .select("id, name, rma_id, cnpj, execution_year, auto_monthly, current_period_month, period_active")
      .eq("id", companyId)
      .single();
    if (cErr || !company) throw new Error("Empresa não encontrada");

    const { data: cTopics } = await sb
      .from("company_rma_topics")
      .select("topic_number, topic_name")
      .eq("company_id", companyId)
      .order("topic_number");

    const expectedTopics = (cTopics || []).map((t) => ({
      number: t.topic_number,
      name: t.topic_name,
    }));
    log.push(`Empresa=${company.name}; tópicos atribuídos=${expectedTopics.length}`);


    // 3. Resolve raiz "Projeto RMA" (com share URL padrão como fallback)
    const DEFAULT_SHARE_URL =
      "https://bexonedrive-my.sharepoint.com/:f:/g/personal/tecnico_brasilexpert_com_br/IgA6tcBZSKW9Qq9kqTMlHODwAWn9lmWTkQNwh_kj1yOvzxA";
    const root = await resolveRoot(body.shareUrl || DEFAULT_SHARE_URL);
    log.push(`Raiz OneDrive resolvida (${root.source})`);

    // 4. Localiza a pasta da empresa e o nível com os tópicos.
    const rootKids = await listChildren(root.driveId, root.itemId);
    const normalizedCompanyName = company.name.toLowerCase().trim();
    const companyNode = rootKids.find((k: any) => k.folder && String(k.name).toLowerCase().trim() === normalizedCompanyName);
    if (!companyNode) {
      throw new Error(`Pasta da empresa '${company.name}' não encontrada no OneDrive`);
    }
    log.push(`Pasta empresa encontrada: ${company.name}`);

    // Determina ano + período mensal (formato MM-YYYY). Para RMA-DIP-MM-YYYY,
    // o código do RMA é a fonte canônica; evita voltar a ler o mês global da
    // empresa (ex.: 06/2026) quando o workspace aberto é Jan/Nov/Dez.
    const now = new Date();
    const dipPeriod = String(company.rma_id || "").match(/^RMA-DIP-(\d{2})-(\d{4})$/i);
    const yearStr = String(body.year || (dipPeriod ? Number(dipPeriod[2]) : company.execution_year) || now.getFullYear());
    const monthNum = Number(body.month || (dipPeriod ? Number(dipPeriod[1]) : company.current_period_month) || (now.getMonth() + 1));
    const monthStr = String(monthNum).padStart(2, "0");
    const monthlyPeriod = `${monthStr}-${yearStr}`; // ex.: 03-2026
    // Permite override por body.period (ex.: "ANUAL"), mas o default agora é mensal
    const periodStr = String(body.period || monthlyPeriod);
    log.push(`Período de leitura: ${yearStr}/${periodStr}`);

    // Procura o melhor container de tópicos: testa empresa/, empresa/{ano}/,
    // empresa/{ano}/{periodo}/ e escolhe aquele com mais subpastas (excluindo operacionais).
    const opSet = new Set(ONEDRIVE_CONFIG.operational_subfolders);
    const candidates: { id: string; label: string; kids: any[] }[] = [];

    const companyChildren = await listChildren(root.driveId, companyNode.id);
    candidates.push({ id: companyNode.id, label: company.name, kids: companyChildren });

    const yearNode = companyChildren.find((c: any) => c.folder && c.name === yearStr);
    let periodFolderFound = false;
    if (yearNode) {
      const yearKids = await listChildren(root.driveId, yearNode.id);
      candidates.push({ id: yearNode.id, label: `${company.name}/${yearStr}`, kids: yearKids });
      const periodAliases = [
        periodStr,
        `${monthStr}.${yearStr}`,
        `${monthStr}_${yearStr}`,
        `${yearStr}-${monthStr}`,
        `${yearStr}.${monthStr}`,
        `${yearStr}_${monthStr}`,
        monthStr,
      ];
      const periodNode = yearKids.find(
        (c: any) => c.folder && periodAliases.some((a) => String(c.name).toLowerCase().trim() === a.toLowerCase()),
      );
      if (periodNode) {
        periodFolderFound = true;
        const periodKids = await listChildren(root.driveId, periodNode.id);
        candidates.push({
          id: periodNode.id,
          label: `${company.name}/${yearStr}/${periodNode.name}`,
          kids: periodKids,
        });
        log.push(`Pasta do período encontrada: ${periodNode.name}`);
      } else {
        log.push(`⚠ Pasta do período (${periodStr}) não encontrada em ${yearStr}`);
      }
    } else {
      log.push(`⚠ Pasta do ano (${yearStr}) não encontrada`);
    }

    // Bloqueia leitura quando a pasta do período não existir (a menos que body.allowMissingPeriod)
    if (!periodFolderFound && !body.allowMissingPeriod) {
      const expectedPath = `Projeto RMA/${company.name}/${yearStr}/${monthStr}.${yearStr}/`;
      throw new Error(
        `Pasta do período não encontrada no OneDrive. Esperado: ${expectedPath}. ` +
        `Crie a pasta MM.AAAA no OneDrive ou ajuste o Mês de referência no cadastro do RMA.`
      );
    }

    // REGRA: quando a pasta do período (MM.AAAA) existir, ela É a fonte
    // autoritária — mesmo que contenha menos subpastas que o nível ANUAL.
    // Isto evita que a função regrida para "DIPLOMATA/2026/" (estrutura legada
    // anual) quando o usuário cadastrou o RMA com mês de referência específico.
    let chosen = candidates[0];
    let chosenTopics = chosen.kids.filter((c: any) => c.folder && !opSet.has(c.name));

    const periodCandidate = candidates.find((c) =>
      c.label.toLowerCase().endsWith(`/${monthStr}.${yearStr}`.toLowerCase()),
    );

    if (periodCandidate) {
      // Força uso do período mensal — fonte autoritária do RMA
      chosen = periodCandidate;
      chosenTopics = periodCandidate.kids.filter((c: any) => c.folder && !opSet.has(c.name));
    } else {
      // Fallback (apenas quando body.allowMissingPeriod=true): mais subpastas
      for (const cand of candidates.slice(1)) {
        const t = cand.kids.filter((c: any) => c.folder && !opSet.has(c.name));
        if (t.length > chosenTopics.length) {
          chosen = cand;
          chosenTopics = t;
        }
      }
    }
    const topicContainerLabel = chosen.label;
    const topicFolders = chosenTopics;
    log.push(
      `Container de tópicos escolhido: ${topicContainerLabel} (candidatos: ${candidates
        .map((c) => `${c.label}=${c.kids.filter((k: any) => k.folder && !opSet.has(k.name)).length}`)
        .join(", ")})${periodCandidate ? " — período forçado" : ""}`,
    );
    log.push(`Subpastas de tópicos encontradas: ${topicFolders.length}`);

    // 7. Iteração na ORDEM do cadastro (company_rma_topics), pasta por pasta
    const balancoConsolidado: any[] = [];
    const dreConsolidado: any[] = [];
    const topicResults: any[] = [];

    // Map flexível: número/nome normalizado → pasta no Drive. As pastas reais
    // podem vir como "01 - Balancete" ou com pequenas diferenças de acento/texto.
    const folderByNumber = new Map<number, any>();
    const folderByNormalizedName = new Map<string, any>();
    for (const tf of topicFolders) {
      const n = leadingTopicNumber(String(tf.name));
      if (n !== null) folderByNumber.set(n, tf);
      const normalized = normalizeTopicName(String(tf.name));
      if (normalized) folderByNormalizedName.set(normalized, tf);
    }

    const findTopicFolder = (expected: { number: number; name: string }) => {
      const byNumber = folderByNumber.get(expected.number);
      if (byNumber) return byNumber;

      const normalizedExpected = normalizeTopicName(expected.name);
      const exact = folderByNormalizedName.get(normalizedExpected);
      if (exact) return exact;

      let best: any = null;
      let bestScore = 0;
      for (const tf of topicFolders) {
        const score = topicMatchScore(expected.name, String(tf.name));
        if (score > bestScore) {
          best = tf;
          bestScore = score;
        }
      }
      return bestScore >= 0.45 ? best : null;
    };

    // ── PRESERVAR SNAPSHOT ANTERIOR ──────────────────────────────────────
    // Antes de iniciar o loop, carregamos os tópicos da última execução
    // bem-sucedida. Eles servem de BASELINE: a UI nunca regride para
    // "pendente"/0% quando uma nova run começa, e tópicos cujos arquivos
    // não mudaram (cache hit em todos) sequer precisam ser reprocessados.
    const { data: prevRun } = await sb
      .from("rma_analysis_results")
      .select("topics, percentual")
      .eq("company_id", companyId)
      .maybeSingle();
    const prevTopicByName = buildPrevTopicMap(((prevRun as any)?.topics) ?? []);
    const baselinePercent = typeof (prevRun as any)?.percentual === "number"
      ? (prevRun as any).percentual
      : 0;

    const initialTopics = mergeTopics(expectedTopics, [], prevTopicByName, null);

    await sb.from("rma_analysis_results").upsert({
      company_id: companyId,
      topics: initialTopics,
      log: [...log],
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });

    const totalTopics = expectedTopics.length || 1;

    // ───── Chunking: processa apenas CHUNK_TOPICS_PER_INVOCATION tópicos por invocação ─────
    // Cada chunk é um sub-job independente (CPU budget próprio). O orquestrador
    // re-invoca a si mesmo via fetch com {_resume:true, runToken, resumeFromIndex}.
    // Idempotência: extend_rma_analysis_lock valida que runToken == lock atual.
    const resumeFromIndex = Math.max(0, Number(body.resumeFromIndex || 0));
    const chunkEndIndex = Math.min(expectedTopics.length, resumeFromIndex + CHUNK_TOPICS_PER_INVOCATION);
    const isLastChunk = chunkEndIndex >= expectedTopics.length;
    log.push(`▣ Sub-job chunk: tópicos ${resumeFromIndex}..${chunkEndIndex - 1} de ${expectedTopics.length} (último=${isLastChunk})`);

    // Helper: persiste progresso parcial preservando o snapshot anterior
    // para tópicos que ainda não foram reprocessados nesta execução.
    const persistProgress = async (
      processedResults: any[],
      _currentIdx: number,
      currentName: string | null,
    ) => {
      const snapshot = mergeTopics(expectedTopics, processedResults, prevTopicByName, currentName);
      const percent = Math.min(99, computePercentual(snapshot, baselinePercent));
      try {
        await sb.from("rma_analysis_results").upsert({
          company_id: companyId,
          status: "em_analise",
          percentual: percent,
          topics: snapshot,
          log: log.slice(-50),
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id" });
      } catch (e) {
        console.error("persistProgress falhou:", e);
      }
    };

    for (let i = resumeFromIndex; i < chunkEndIndex; i++) {
      const expected = expectedTopics[i];
      const tf = findTopicFolder(expected);

      // Marca este tópico como "processing" antes de iniciar
      log.push(`▶ Iniciando tópico [${expected.name}]`);
      await persistProgress(topicResults, i, expected.name);

      // Sem pasta no Drive → PENDENTE (tópico ainda não foi entregue)
      if (!tf) {
        topicResults.push({
          number: expected.number,
          name: expected.name,
          status: "pendente",
          completude: 0,
          fileCount: 0,
          docsParsed: 0,
          errors: ["Pasta não encontrada no OneDrive"],
          processing: false,
        });
        log.push(`◌ Tópico [${expected.name}] PENDENTE — pasta inexistente no OneDrive`);
        await persistProgress(topicResults, i + 1, null);
        continue;
      }

      const items = await listChildren(root.driveId, tf.id);
      const validFiles = items
        .filter((it: any) => it.file)
        .map((it: any) => {
          try {
            const v = validateFile(it.name, it.size || 0);
            return { ...it, ext: v.ext, valid: true as const };
          } catch (e) {
            return { ...it, ext: "", valid: false as const, error: (e as Error).message };
          }
        });

      // ── Tracker completo: registra TODOS os arquivos válidos da pasta em
      // onedrive_files (não apenas os 3 PDFs/imagens enviados ao OCR). Sem
      // este upsert, planilhas (.xlsx/.xls/.csv), .docx e PDFs além do limite
      // de OCR ficavam invisíveis para a UI (Recebimento por Pasta).
      // IMPORTANTE: NÃO sobrescrevemos o status de arquivos já existentes —
      // só inserimos novos (status='tracked'). Caso contrário, perderíamos o
      // marcador 'processed' (gerado por getOrParseFile) e o Delta Engine
      // reprocessaria tudo do zero na próxima execução.
      const validFilesOnly = validFiles.filter((f) => f.valid);
      const existingIds = new Set<string>();
      if (validFilesOnly.length > 0) {
        const { data: existingRows } = await sb
          .from("onedrive_files")
          .select("file_id")
          .in("file_id", validFilesOnly.map((f: any) => f.id));
        for (const r of (existingRows || [])) existingIds.add((r as any).file_id);
      }
      const trackerRows = validFilesOnly
        .filter((f: any) => !existingIds.has(f.id))
        .map((f: any) => ({
          file_id: f.id,
          drive_id: root.driveId,
          company_id: companyId,
          rma_id: company.rma_id ?? null,
          path: `${topicContainerLabel}/${tf.name}/${f.name}`,
          file_name: f.name,
          mime_type: f.file?.mimeType ?? "application/octet-stream",
          size_bytes: typeof f.size === "number" ? f.size : null,
          etag: f.eTag ?? f.cTag ?? null,
          last_modified: f.lastModifiedDateTime ?? null,
          last_seen_at: new Date().toISOString(),
          ano: Number(yearStr),
          mes: monthNum,
          status: "tracked",
          metadata: { topic_number: expected.number, topic_name: expected.name },
        }));
      // Para os já existentes: só atualiza last_seen_at (sem mexer no status).
      if (existingIds.size > 0) {
        try {
          await sb.from("onedrive_files")
            .update({ last_seen_at: new Date().toISOString() })
            .in("file_id", Array.from(existingIds));
        } catch (e) {
          console.error("tracker last_seen update failed:", (e as Error).message);
        }
      }
      if (trackerRows.length > 0) {
        try {
          await sb.from("onedrive_files").insert(trackerRows);
        } catch (e) {
          console.error("tracker insert failed:", (e as Error).message);
        }
      }

      const usableForOCR = validFiles
        .filter((f) => f.valid && (f.size || 0) <= PARSE_MAX_BYTES)
        .filter((f) => ["pdf", "png", "jpg", "jpeg"].includes(f.ext))
        .slice(0, MAX_FILES_PER_TOPIC);

      let docsParsed = 0;
      let docsFromCache = 0;
      let docsNewlyParsed = 0;
      const errors: string[] = [];

      // ── Hard timeout por tópico: garante que o loop continua mesmo se a pasta engasgar
      // (evita travar em pastas pesadas como "Relação de Notas Fiscais de Compras").
      const topicDeadline = Date.now() + TOPIC_TIMEOUT_MS;
      let topicTimedOut = false;
      for (const f of usableForOCR) {
        if (Date.now() > topicDeadline) {
          topicTimedOut = true;
          errors.push(`Timeout do tópico (>${TOPIC_TIMEOUT_MS / 1000}s) — restantes ignorados`);
          break;
        }
        try {
          const parsed = await getOrParseFile({
            sb,
            driveId: root.driveId,
            item: f,
            companyId,
            rmaId: company.rma_id ?? null,
            ano: Number(yearStr),
            mes: monthNum,
            topicNumber: expected.number,
            topicName: expected.name,
            topicPath: `${topicContainerLabel}/${tf.name}`,
            stats: incrementalStats,
          });
          balancoConsolidado.push(...parsed.balanco);
          dreConsolidado.push(...parsed.dre);
          docsParsed++;
          if (parsed.fromCache) docsFromCache++; else docsNewlyParsed++;
        } catch (e) {
          const em = (e as Error).message.slice(0, 120);
          errors.push(`${f.name}: ${em}`);
          log.push(`   ⚠ ${f.name} falhou (${em}) — RMA segue sem este arquivo; verifique "Upload manual exigido"`);
        }
      }
      if (usableForOCR.length > 0) {
        log.push(`   ↳ ${expected.name}: ${docsFromCache} cache, ${docsNewlyParsed} novos${topicTimedOut ? " [TIMEOUT-tópico]" : ""}`);
      }

      const fileCount = validFiles.filter((f) => f.valid).length;
      // Classificação por presença de pasta + arquivos:
      //   • PENDENTE   → pasta inexistente (tratado acima)
      //   • INCOMPLETO → pasta existe mas SEM arquivos válidos
      //   • COMPLETO   → pasta existe COM ≥1 arquivo válido
      // (a profundidade de leitura pela IA refina o % de completude, sem rebaixar status)
      let status: "pendente" | "incompleto" | "completo";
      let completude: number;
      if (fileCount === 0) {
        status = "incompleto";
        completude = 0;
      } else {
        status = "completo";
        // Alvo = total de arquivos OCR-áveis (pdf/png/jpg dentro do limite de tamanho).
        // Sem limite arbitrário: 100% só quando todos forem efetivamente parseados.
        const target = usableForOCR.length;
        const presence = 50;
        const parseRatio = target > 0 ? docsParsed / target : 1;
        completude = Math.min(100, Math.round(presence + parseRatio * 50));
      }

      topicResults.push({
        number: expected.number,
        name: expected.name,
        status,
        completude,
        fileCount,
        docsParsed,
        errors: errors.slice(0, 3),
        processing: false,
      });
      log.push(`✓ Tópico [${expected.name}] arquivos=${fileCount} processados=${docsParsed} status=${status}`);

      await persistProgress(topicResults, i + 1, null);
    }

    topicResults.sort((a, b) => a.number - b.number);

    // ─── ASSERÇÃO INCREMENTAL (parcial deste chunk) ─────────────────────
    const s = incrementalStats;
    const totalParses = s.firstParse + s.updatedReparse + s.violations;
    log.push(
      `▣ Chunk incremental: cache=${s.cacheHits} new=${s.firstParse} updated=${s.updatedReparse} violations=${s.violations} (parses=${totalParses})`,
    );
    if (s.violations > 0) {
      log.push(`✗ VIOLAÇÃO INCREMENTAL: ${s.violations} arquivo(s) reparseado(s) sem mudança em etag/last_modified`);
      for (const v of s.violationDetails.slice(0, 5)) log.push(`  • ${v}`);
    }

    // ───── Não é o último chunk → re-invoca o próximo sub-job e retorna ─────
    if (!isLastChunk) {
      try {
        const url = Deno.env.get("SUPABASE_URL");
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!url || !key) throw new Error("SUPABASE_URL/KEY ausentes para resume");
        // Persiste log + topics parciais antes de delegar (preserva snapshot na UI)
        const partialMerged = mergeTopics(expectedTopics, topicResults, prevTopicByName, null);
        const partialPct = Math.min(99, computePercentual(partialMerged, baselinePercent));
        await sb.from("rma_analysis_results").upsert({
          company_id: companyId,
          status: "em_analise",
          percentual: partialPct,
          topics: partialMerged,
          log: log.slice(-200),
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id" });

        log.push(`→ Disparando próximo sub-job (resumeFromIndex=${chunkEndIndex})`);
        fetch(`${url}/functions/v1/rma-analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            apikey: key,
          },
          body: JSON.stringify({
            ...body,
            _resume: true,
            runToken: lockToken,
            resumeFromIndex: chunkEndIndex,
          }),
        }).catch((e) => console.error("[rma-analyze] resume fetch falhou:", e));
      } catch (e) {
        console.error("[rma-analyze] schedule resume:", (e as Error).message);
      }
      keepLockForNextChunk = true; // próximo sub-job assume o mesmo runToken
      return; // finalize só roda no último chunk
    }

    // ───── Último chunk: agrega TODOS os arquivos parseados desta empresa/período
    //       a partir do cache (chunks anteriores não preservaram balanço/DRE em memória).
    let balancoFinal: any[] = balancoConsolidado;
    let dreFinal: any[] = dreConsolidado;
    try {
      const { data: cachedAll } = await sb
        .from("rma_file_parse_cache")
        .select("balanco,dre")
        .eq("company_id", companyId)
        .eq("ano", Number(yearStr))
        .eq("mes", monthNum);
      if (Array.isArray(cachedAll)) {
        balancoFinal = cachedAll.flatMap((r: any) => Array.isArray(r.balanco) ? r.balanco : []);
        dreFinal = cachedAll.flatMap((r: any) => Array.isArray(r.dre) ? r.dre : []);
        log.push(`▣ Finalize: agregados ${balancoFinal.length} linhas balanço + ${dreFinal.length} linhas DRE de ${cachedAll.length} arquivos em cache`);
      }
    } catch (e) {
      console.error("agregação final do cache falhou:", (e as Error).message);
    }

    // Funde com baseline: tópicos não-reprocessados nesta run mantêm snapshot anterior
    const mergedTopics = mergeTopics(expectedTopics, topicResults, prevTopicByName, null);
    const completos = mergedTopics.filter((t) => t.status === "completo").length;
    const total = mergedTopics.length || 1;
    const topicPercent = computePercentual(mergedTopics, baselinePercent);

    // ─── Pipeline floor: % de arquivos efetivamente processados no OneDrive
    //     (mantém o número do workspace alinhado ao pipeline real)
    let pipelineStats: { ok: number; manual: number; pending: number; total: number; percent: number } | null = null;
    try {
      if (company.rma_id) {
        const { data: ofRows } = await sb
          .from("onedrive_files")
          .select("status")
          .eq("rma_id", company.rma_id);
        const rows = (ofRows || []) as Array<{ status: string }>;
        const okSet = new Set(["done", "completed", "processed", "manual_uploaded"]);
        const ignoredSet = new Set(["ignored", "inactive"]);
        const counted = rows.filter((r) => !ignoredSet.has(r.status));
        const ok = counted.filter((r) => okSet.has(r.status)).length;
        const manual = counted.filter((r) => r.status === "manual_upload_required").length;
        const pending = counted.length - ok - manual;
        const percent = counted.length > 0 ? Math.round((ok / counted.length) * 100) : 0;
        pipelineStats = { ok, manual, pending, total: counted.length, percent };
        log.push(`▣ Pipeline OneDrive: ${ok}/${counted.length} OK (${percent}%) · manual=${manual} · pendente=${pending}`);
      }
    } catch (e) {
      console.error("pipeline stats falhou:", (e as Error).message);
    }

    // Percentual final = max(topic-average, pipeline-floor) — nunca abaixo do que
    // o pipeline real entregou. Garante que "94% dos arquivos OK" se reflita.
    const percentual = pipelineStats
      ? Math.max(topicPercent, pipelineStats.percent)
      : topicPercent;

    // 8. Análise consolidada via IA (somente se houver dados)
    let analysisOut: any = null;
    if (balancoFinal.length > 0 || dreFinal.length > 0) {
      try {
        analysisOut = await analyzeWithAI(balancoFinal, dreFinal, company.name);
        log.push("Análise multi-agente concluída");
      } catch (e) {
        log.push(`Falha na análise: ${(e as Error).message.slice(0, 200)}`);
      }
    } else {
      log.push("Sem dados contábeis extraídos — análise consolidada pulada");
    }

    // 9. Persiste resultado (snapshot atual)
    const diagnosticoFinal = {
      ...(analysisOut?.diagnostico ?? {}),
      pipeline: pipelineStats,
      topic_percent: topicPercent,
    };
    const final = {
      company_id: companyId,
      status: "concluido" as const,
      percentual,
      topics: mergedTopics,
      diagnostico: diagnosticoFinal,
      indicadores: analysisOut?.indicadores ?? null,
      kanitz: analysisOut?.kanitz ?? null,
      score_rj: analysisOut?.scoreRJ ?? null,
      pendencias: analysisOut?.pendencias ?? null,
      alertas: analysisOut?.alertas ?? null,
      balanco: balancoFinal.slice(0, 500),
      dre: dreFinal.slice(0, 500),
      log,
      error_message: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await sb.from("rma_analysis_results").upsert(final, { onConflict: "company_id" });

    // 9a. Encadeia balancete-build em background (mesma análise → alimenta Balancete)
    try {
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && key) {
        fetch(`${url}/functions/v1/balancete-build`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            apikey: key,
          },
          body: JSON.stringify({
            company_id: companyId,
            empresa_nome: company.name,
            year: Number(yearStr),
            month: monthNum,
            force: false,
            use_smart_prompt: true,
          }),
        }).catch((e) => console.error("balancete-build trigger:", e));
        log.push(`→ Balancete-build disparado em background (${monthlyPeriod})`);
      }
    } catch (e) {
      console.error("trigger balancete-build:", e);
    }

    // 9b. Snapshot por período (histórico mensal)
    try {
      await sb.from("rma_period_analyses").upsert({
        company_id: companyId,
        year: Number(yearStr),
        month: monthNum,
        period_label: monthlyPeriod,
        status: "concluido",
        percentual,
        topics: mergedTopics,
        diagnostico: diagnosticoFinal,
        indicadores: analysisOut?.indicadores ?? null,
        kanitz: analysisOut?.kanitz ?? null,
        score_rj: analysisOut?.scoreRJ ?? null,
        pendencias: analysisOut?.pendencias ?? null,
        alertas: analysisOut?.alertas ?? null,
        balanco: balancoFinal.slice(0, 500),
        dre: dreFinal.slice(0, 500),
        log: log.slice(-200),
        error_message: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id,period_label" });

      await sb.from("companies").update({
        last_analyzed_period: monthlyPeriod,
        current_period_month: monthNum,
        execution_year: Number(yearStr),
      }).eq("id", companyId);
    } catch (e) {
      console.error("snapshot período falhou:", e);
    }

    await audit({
      documentId: null,
      step: "rma_analyze",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: { companyId, percentual, topicsTotal: total, completos, period: monthlyPeriod },
    });

    log.push(`✓ Análise concluída em ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("rma-analyze bg:", msg);
    try {
      const sb = getServiceClient();
      await sb.from("rma_analysis_results").upsert({
        company_id: companyId,
        status: "erro",
        error_message: msg.slice(0, 500),
        log: [...log, `[ERRO] ${msg}`],
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });
    } catch {}
    await audit({
      documentId: null,
      step: "rma_analyze",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: msg,
      details: { companyId },
    });
  } finally {
    await releaseLock();
  }
}

