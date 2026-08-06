// Processa jobs pendentes: baixa PDF do link, envia ao Gemini, extrai campos e atualiza a linha.
// Body: { limit?: number, job_id?: string }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { acquireDocument, getDocument, logAccess } from "../_shared/document-acquisition.ts";
import { ingestWorkspace } from "../_shared/knowledge-registry.ts";
import { validateCanonical, formatIssues, CANONICAL_SCHEMA_VERSION } from "../_shared/canonical-schema.ts";
import { persistBusinessFacts } from "../_shared/business-facts.ts";
import { logStage } from "../_shared/processing-telemetry.ts";
import { uploadGeminiFile } from "../_shared/gemini-files.ts";




const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
const MODELO_GEMINI = "gemini-3.6-flash"; // melhor Gemini 3.X disponível
const MODELO_FALLBACK = "gemini-3.6-flash";

const EXTRACTION_PROMPT = `Você é um Auditor Contábil e Jurídico Sênior da BEx. Sua missão é realizar a extração cognitiva de dados de processos judiciais conforme o MD - PARTE 4, MD-GEMINI-PROCESS-INTELLIGENCE-PANEL-001 e MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001.

OBJETIVO: Interpretar todos os valores jurídicos, gerar um modelo único de dados (Workspace) e produzir uma Análise Inteligente Executiva.

DIRETRIZES DE ANÁLISE INTELIGENTE (MD-001):
1. Resumo Executivo: Texto exclusivo em linguagem natural explicando natureza, objetivo, fase e conclusão.
2. Por que interessa à BEx?: Explique por que representa oportunidade, fase atual e possibilidade de nomeação de AJ.
3. Próximos Eventos: Sequência lógica esperada para a fase identificada.
4. Recomendação IA: Ação comercial sugerida (ex: priorizar contato, monitorar).
5. Score Comercial: Calcule de 0-100 considerando prioridade, potencial econômico, complexidade e maturidade.
6. Resumo Comercial: SIM, MÉDIO ou NÃO com justificativa.
7. Alertas: Documentos duplicados, grupo econômico, divergência de valores, etc.

DIRETRIZES DE EXTRAÇÃO DE VALORES (Identifique separadamente):
- Valor da causa
- Valor do crédito
- Valor atualizado
- Passivo Concursal (Prioridade 1 RJ)
- Passivo Extraconcursal
- Passivo Total Declarado (Prioridade 2 RJ)
- Passivo Total Calculado
- Créditos Trabalhistas, Quirografários, ME/EPP
- Garantias
- Restrição REFIN/PEFIN, Protestos

NUNCA substitua um valor por outro.

CRITÉRIO DE EXPORTAÇÃO (Campo valor_exportacao):
1. Recuperação Judicial: 1º Passivo Concursal, 2º Passivo Declarado, 3º Valor da Causa.
2. Falência: 1º Valor da Causa, 2º Crédito Atualizado, 3º Crédito Original.
3. Autofalência: 1º Passivo Declarado, 2º Valor da Causa.

BUSINESS FACTS (Gere um objeto para cada valor encontrado):
Campos: { "tipo": string, "valor": number, "moeda": "BRL", "origem": string, "pagina": number, "confianca": number }

ALERTAS AUTOMÁTICOS:
Gere alerta se: valores divergentes, mais de um passivo, passivo calculado, valor por extenso diferente, documento incompleto.

SCHEMA DE RESPOSTA (JSON APENAS):
{
  "workspace": {
    "processo": string (CNJ),
    "empresa": string (Razão Social),
    "empresas_relacionadas": [{ "nome": string, "cnpj": string, "papel": string }],
    "tipo_processo": "Recuperação Judicial" | "Falência" | "Autofalência" | "Outro",
    "fase": string,
    "vara": string,
    "comarca": string,
    "estado": string (UF),
    "valor_exportacao": number,
    "natureza_valor": string,
    "administrador_judicial": string,
    "juiz": string,
    "resumo_executivo": string,
    "interesse_bex": string,
    "proximos_eventos": string[],
    "recomendacao_ia": string,
    "score_comercial": {
      "prioridade": number,
      "potencial": number,
      "complexidade": number,
      "probabilidade_aj": number,
      "score_geral": number
    },
    "resumo_comercial": { "status": "SIM" | "MÉDIO" | "NÃO", "justificativa": string },
    "alertas": [{ "tipo": string, "mensagem": string, "gravidade": "alta"|"media"|"baixa" }],
    "business_facts": [ ... ],
    "evidencias": [{ "campo": string, "pagina": number, "trecho": string }],
    "score_confianca": number (0-100)
  },
  "classificacao": { "tipo_documento": string, "fase_processual": string, "prioridade": string }
}

Responda APENAS com o JSON válido.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GOOGLE_AI_API_KEY) return json({ error: "GOOGLE_AI_API_KEY ausente" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 5), 10);
    const onlyJob = body.job_id as string | undefined;
    const isHomologation = body.mode === "homologacao";

    let jobs: any[] = [];
    if (onlyJob) {
      const { data: job, error: qErr } = await admin.from("prospeccao_pdf_jobs").select("*").eq("id", onlyJob).single();
      if (qErr) throw qErr;
      jobs = [job];
    } else {
      const { data: j, error: qErr } = await admin.from("prospeccao_pdf_jobs")
        .select("*")
        .in("status", ["pendente", "baixado"])
        .limit(limit);
      if (qErr) throw qErr;
      jobs = j || [];
    }

    // Modo homologação: nunca depende da fila. Aceita links avulsos (body.links)
    // ou lê direto das linhas da planilha que possuem link_documento.
    if (isHomologation) {
      const manualLinks: string[] = Array.isArray(body.links) ? body.links.filter(Boolean) : [];
      if (manualLinks.length > 0) {
        jobs = manualLinks.slice(0, limit).map((link, i) => ({
          id: `homolog-${i}`, link, status: "pendente", linha_id: null, user_id: null, attempts: 0,
        }));
      } else if (jobs.length === 0) {
        const { data: linhas } = await admin
          .from("prospeccao_linhas")
          .select("id,user_id,link_documento")
          .not("link_documento", "is", null)
          .limit(limit);
        jobs = (linhas || []).map((l: any) => ({
          id: `homolog-${l.id}`, link: l.link_documento, status: "pendente",
          linha_id: l.id, user_id: l.user_id, attempts: 0,
        }));
      }
      if (jobs.length === 0) {
        return json({
          ok: false,
          mode: "homologacao",
          error: "Nenhum documento disponível para homologação. Faça o upload de uma planilha com a coluna Link_Documento (ou envie 'links' no corpo da requisição).",
          timestamp: new Date().toISOString(),
          total_processos: 0, total_pdfs: 0, ocr_executados: 0, tempo_total_ms: 0, processos: [],
        }, 200);
      }
    }

    const tStart = Date.now();
    const homologationResults: any[] = [];
    const results: unknown[] = [];

    for (const job of jobs || []) {
      try {
        let pdfBytes: Uint8Array | null = null;
        let storagePath = job.storage_path as string | null;
        let documentId: string | null = job.fetch_metadata?.document_id ?? null;
        let registryId: string | null = job.registry_id ?? null;

        if (documentId && !isHomologation) {
          // Documento já certificado no Registro Corporativo — IA recebe Document_ID
          const { bytes } = await getDocument(documentId, {
            motor_ia: MODELO_GEMINI, projeto: "prospeccao_bex",
          });
          pdfBytes = bytes;
        } else if (job.status === "pendente" || !storagePath) {
          // MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001
          // Toda aquisição passa exclusivamente pela camada corporativa.
          const acq = await acquireDocument({
            url: job.link as string,
            projeto: "prospeccao_bex",
            user_id: job.user_id ?? null,
            dryRun: isHomologation,
          });
          pdfBytes = acq.bytes;
          storagePath = acq.storage_path;
          documentId = acq.document_id;
          registryId = acq.registry_id;

          if (!isHomologation) {
            await admin.from("prospeccao_document_fetch_logs")
              .update({ linha_id: job.linha_id, job_id: job.id })
              .eq("registry_id", registryId)
              .is("job_id", null);

            await admin.from("prospeccao_pdf_jobs").update({
              status: "baixado",
              storage_path: storagePath,
              doc_hash: acq.hash_sha256,
              registry_id: registryId,
              fetch_metadata: {
                document_id: documentId,
                versao: acq.versao,
                conector: acq.conector,
                origem: acq.origem,
                paginas: acq.paginas,
                certificado: acq.certificado,
                reused: acq.reused,
                tempos: acq.tempos,
                size: acq.tamanho_bytes,
              },
            }).eq("id", job.id);
          }
        } else {
          // Legado: documento já baixado no bucket de uploads
          const { data: file, error } = await admin.storage.from("prospeccao-uploads").download(storagePath);
          if (error) throw error;
          pdfBytes = new Uint8Array(await file.arrayBuffer());
        }


        const t0 = Date.now();
        const docHash = await sha256Hex(pdfBytes);

        // PARTE 5 — Documento Duplicado: mesmo hash já certificado para o usuário
        const dup = isHomologation ? null : (await admin
          .from("prospeccao_linhas")
          .select("id")
          .eq("user_id", job.user_id)
          .eq("doc_hash", docHash)
          .neq("id", job.linha_id)
          .limit(1)
          .maybeSingle()).data;

        if (dup) {
          await admin.from("prospeccao_linhas").update({
            ai_status: "extraido",
            status_certificacao: "Documento Duplicado",
            doc_hash: docHash,
          }).eq("id", job.linha_id);
          await admin.from("prospeccao_pdf_jobs").update({ status: "extraido" }).eq("id", job.id);
          await logEvent(admin, job, MODELO_GEMINI, Date.now() - t0, "Documento Duplicado", { duplicado_de: dup.id });
          results.push({ job: job.id, ok: true, status: "Documento Duplicado" });
          continue;
        }


        const { callLLM } = await import("../_shared/llm-service.ts");

        const tExtract = Date.now();
        // Upload binário via Files API (sem base64 inline) — suporta PDFs grandes sem estourar memória
        const fileUri = await uploadGeminiFile(pdfBytes, "application/pdf", `job-${job.id}.pdf`);

        const chamarGemini = (m: string) => callLLM({
          prompt: EXTRACTION_PROMPT,
          system: "Você é um Auditor Sênior especializado em prospecção de Administração Judicial.",
          provider: "gemini", // motor exclusivo Gemini — sem fallback de provedor
          model: m,
          useCache: true,
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

        // Resiliência: 503/500 (modelo sobrecarregado) → retry com backoff exponencial
        // Degradação controlada: 429 (sem cota) → fallback para o Gemini 3.x disponível
        let modeloUsado = MODELO_GEMINI;
        let aiResult;
        let ultimaFalha: unknown = null;
        for (let tentativa = 0; tentativa < 4; tentativa++) {
          try {
            aiResult = await chamarGemini(modeloUsado);
            ultimaFalha = null;
            break;
          } catch (err) {
            ultimaFalha = err;
            const msg = String((err as Error)?.message ?? err);
            if (msg.includes("429") && modeloUsado !== MODELO_FALLBACK) {
              console.warn(`[worker] ${modeloUsado} sem cota (429) → fallback ${MODELO_FALLBACK}`);
              modeloUsado = MODELO_FALLBACK;
              continue;
            }
            const transitorio = /\b(429|500|502|503|504)\b/.test(msg);
            if (!transitorio || tentativa === 3) throw err;
            const espera = 2000 * Math.pow(2, tentativa);
            console.warn(`[worker] Gemini transitório (${msg.slice(0, 80)}) → retry em ${espera}ms`);
            await new Promise((r) => setTimeout(r, espera));
          }
        }
        if (!aiResult) throw ultimaFalha ?? new Error("GEMINI_SEM_RESPOSTA");


        const content = aiResult.text || "";

        logStage({
          linha_id: job.linha_id ?? null,
          document_id: documentId,
          stage: "extraction",
          duration_ms: Date.now() - tExtract,
          bytes: pdfBytes?.length ?? 0,
          tokens_input: aiResult.tokens?.input ?? 0,
          tokens_output: aiResult.tokens?.output ?? 0,
          model: modeloUsado,
          provider: aiResult.provider,
          metadata: { cached: aiResult.cached, homologacao: isHomologation, file_api: true },
        });

        const rawExtracted = extractJson(content);

        // JSON Canônico — validação estrita (rejeita e marca erro quando inválido)
        const tValid = Date.now();
        const validation = validateCanonical(rawExtracted);
        logStage({
          linha_id: job.linha_id ?? null,
          document_id: documentId,
          stage: "validation",
          status: validation.valid ? "success" : "error",
          duration_ms: Date.now() - tValid,
          error_message: validation.valid ? null : formatIssues(validation.issues),
          metadata: { schema_version: CANONICAL_SCHEMA_VERSION, issues: validation.issues },
        });

        if (!validation.valid) {
          throw new Error(
            `JSON canônico inválido (schema ${CANONICAL_SCHEMA_VERSION}): ${formatIssues(validation.issues)}`,
          );
        }

        const extracted = validation.normalized as Record<string, any>;
        const ws = extracted.workspace || {};


        if (!isHomologation && documentId) {
          await logAccess({
            document_id: documentId, registry_id: registryId, projeto: "prospeccao_bex",
            motor_ia: MODELO_GEMINI, acao: "ai_extraction", hash_sha256: docHash,
            resultado: content ? "ok" : "vazio", tempo_ms: Date.now() - t0,
            user_id: job.user_id ?? null,
          });
        }


        // PARTE 5 & MD-001 — Certificação
        const certificacao = {
          pdf_processado: Boolean(content && content.length > 0),
          documento_classificado: Boolean(extracted.classificacao?.tipo_documento || ws.tipo_processo),
          empresas_identificadas: Boolean(ws.empresa),
          valores_interpretados: ws.valor_exportacao != null && Number(ws.valor_exportacao) > 0,
          business_facts_gerados: Array.isArray(ws.business_facts) && ws.business_facts.length > 0,
          json_produzido: Object.keys(ws).length > 0,
          evidencias_registradas: Array.isArray(ws.evidencias) && ws.evidencias.length > 0,
          score_calculado: ws.score_confianca != null,
          inteligencia_executiva_ok: Boolean(ws.resumo_executivo && ws.recomendacao_ia && ws.interesse_bex),
        };
        const certOk = Object.values(certificacao).every(Boolean);

        let statusCert = "Revisão Manual";
        if (!certificacao.json_produzido || !certificacao.pdf_processado) statusCert = "Documento Inválido";
        else if (certOk) statusCert = "Concluído";

        if (isHomologation) {
          homologationResults.push({
            processo: ws.processo || "Não identificado",
            empresa: ws.empresa || "Não identificado",
            link: job.link,
            status: statusCert,
            resumo_executivo: ws.resumo_executivo,
            oportunidade_bex: ws.interesse_bex,
            score_comercial: ws.score_comercial?.score_geral || 0,
            evidencias: ws.evidencias || [],
            comparativo: [
              { campo: "Empresa", valor_gemini: ws.empresa },
              { campo: "Processo", valor_gemini: ws.processo },
              { campo: "Valor", valor_gemini: ws.valor_exportacao }
            ],
            json_resumido: extracted,
            checklist: certificacao,
            analise_ia: ws
          });
          continue;
        }

        // Data de distribuição e mês de referência
        const dataDist = normalizeDate(ws.data_distribuicao || extracted.entidades?.processo?.data_distribuicao);
        const mesRef = dataDist ? dataDist.slice(0, 7) : null;

        // 1. Atualizar a planilha automaticamente (sem intervenção do usuário)
        const linhaUpdate: Record<string, unknown> = {
          ai_status: "extraido",
          ai_extracted: extracted,
          numero_processo: ws.processo || null,
          parte_pro_nome: ws.empresa || null,
          orgao_tribunal: ws.vara ? `${ws.vara} - ${ws.comarca ?? ""}`.trim() : (ws.comarca || null),
          uf: ws.estado || null,
          municipio: ws.comarca || null,
          valor_pleito: ws.valor_exportacao ?? null,
          tipo_acao: ws.tipo_processo || null,
          pedidos_principais: `Juiz: ${ws.juiz || "N/A"} | AJ: ${ws.administrador_judicial || "N/A"}`,
          status_certificacao: statusCert,
          certificacao,
          data_distribuicao: dataDist,
          mes_referencia: mesRef,
          doc_hash: docHash,
          ai_error: null,
          // Vincular Document ID Corporativo (motores IA nunca usam URL)
          metadata: {
            ...(job.fetch_metadata || {}),
            document_id: documentId,
            registry_id: registryId,
          }

        };

        await admin.from("prospeccao_linhas").update(linhaUpdate).eq("id", job.linha_id);

        // 2. Gerenciar Versionamento no Workspace
        const { data: latestVersao } = await admin
          .from("prospeccao_workspace")
          .select("versao")
          .eq("linha_id", job.linha_id)
          .order("versao", { ascending: false })
          .limit(1)
          .maybeSingle();

        const proximaVersao = (latestVersao?.versao || 0) + 1;

        const { data: wsRow } = await admin.from("prospeccao_workspace").insert({
          linha_id: job.linha_id,
          versao: proximaVersao,
          numero_processo: ws.processo,
          empresa_principal: ws.empresa,
          empresas_relacionadas: ws.empresas_relacionadas || [],
          tipo_processo: ws.tipo_processo,
          fase: ws.fase,
          vara: ws.vara,
          comarca: ws.comarca,
          estado: ws.estado,
          valor_exportacao: ws.valor_exportacao,
          natureza_valor: ws.natureza_valor,
          administrador_judicial: ws.administrador_judicial,
          juiz: ws.juiz,
          alertas: ws.alertas || [],
          business_facts: ws.business_facts || [],
          evidencias: ws.evidencias || [],
          score_confianca: ws.score_confianca,
          resumo_executivo: ws.resumo_executivo,
          interesse_bex: ws.interesse_bex,
          recomendacao_ia: ws.recomendacao_ia,
          score_comercial: ws.score_comercial,
          resumo_comercial: ws.resumo_comercial,
          raw_response: extracted,
          created_by: job.user_id
        }).select("id").maybeSingle();

        // 2.0 Business Facts canônicos (EAV tipado)
        const tFacts = Date.now();
        const factsSaved = await persistBusinessFacts(admin, ws, {
          linha_id: job.linha_id,
          workspace_id: wsRow?.id ?? null,
          document_id: documentId,
          numero_processo: ws.processo ?? null,
          source: "gemini_extraction",
        });
        logStage({
          linha_id: job.linha_id ?? null,
          document_id: documentId,
          stage: "persistence",
          duration_ms: Date.now() - tFacts,
          metadata: { business_facts: factsSaved, versao: proximaVersao },
        });



        // 2.1 MD-ENTERPRISE-KNOWLEDGE-REGISTRY-001 — consolidar conhecimento corporativo
        await ingestWorkspace(ws, {
          document_id: documentId,
          registry_id: registryId,
          business_fact: { business_facts: ws.business_facts ?? [], evidencias: ws.evidencias ?? [] },
          hash_sha256: docHash,
          motor_ia: MODELO_GEMINI,
          confiabilidade: ws.score_confianca ?? null,
          user_id: job.user_id ?? null,
        });

        // 3. Finalizar Job

        await admin.from("prospeccao_pdf_jobs").update({
          status: "extraido",
          extracted_json: extracted,
          metadata: {
            versao: proximaVersao,
            certificacao,
            status_certificacao: statusCert,
            processed_at: new Date().toISOString()
          }
        }).eq("id", job.id);

        // 4. Log de execução detalhado (MD-001 Parte 14)
        await logEvent(admin, job, MODELO_GEMINI, Date.now() - t0, statusCert, { 
          versao: proximaVersao, 
          certificacao,
          performance: {
            processamento_documento_ms: Date.now() - t0,
            gemini_version: MODELO_GEMINI
          }
        });

        // 5. Atualizar Indicadores (MD-001 Parte 16)
        try {
          await admin.rpc('increment_prospeccao_metrics', {
            p_prioridade: (ws.score_comercial?.prioridade || 0) > 70 ? 'alta' : (ws.score_comercial?.prioridade || 0) > 30 ? 'media' : 'baixa',
            p_tem_aj: Boolean(ws.administrador_judicial)
          });
        } catch (e) { console.error("Metrics update failed:", e); }


        logStage({
          linha_id: job.linha_id ?? null,
          document_id: documentId,
          stage: "total",
          duration_ms: Date.now() - t0,
          model: MODELO_GEMINI,
          provider: "gemini",
          metadata: { status_certificacao: statusCert },
        });

        results.push({ job: job.id, ok: true, status: statusCert });
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        const isSchemaError = /JSON canônico inválido/i.test(msg);
        const statusErro = isSchemaError
          ? "Schema Inválido"
          : (/gemini|download|http|pdf/i.test(msg) ? "Erro OCR" : "Revisão Manual");
        logStage({
          linha_id: job.linha_id ?? null,
          stage: "total",
          status: "error",
          error_message: msg,
          model: MODELO_GEMINI,
          provider: "gemini",
          metadata: { status_certificacao: statusErro, homologacao: isHomologation },
        });
        if (isHomologation) {

          homologationResults.push({
            processo: "Não identificado", empresa: "Não identificado", link: job.link,
            status: statusErro, resumo_executivo: `Falha no processamento: ${msg}`,
            oportunidade_bex: "-", score_comercial: 0, evidencias: [], comparativo: [],
            json_resumido: {}, checklist: {}, analise_ia: {},
          });
          results.push({ job: job.id, ok: false, error: msg });
          continue;
        }
        await admin.from("prospeccao_pdf_jobs").update({
          status: "erro", error: msg, attempts: (job.attempts || 0) + 1,
        }).eq("id", job.id);
        await admin.from("prospeccao_linhas").update({
          ai_status: "erro", ai_error: msg, status_certificacao: statusErro,
        }).eq("id", job.linha_id);
        await logEvent(admin, job, MODELO_GEMINI, 0, statusErro, { erro: msg });
        results.push({ job: job.id, ok: false, error: msg });
      }

    }

    if (isHomologation) {
      return json({
        ok: true,
        mode: "homologacao",
        timestamp: new Date().toISOString(),
        total_processos: homologationResults.length,
        total_pdfs: homologationResults.length,
        ocr_executados: homologationResults.length,
        tempo_total_ms: Date.now() - tStart,
        processos: homologationResults
      });
    }

    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}


async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function logEvent(
  admin: any,
  job: any,
  modelo: string,
  tempoMs: number,
  resultado: string,
  detalhes: Record<string, unknown>,
) {
  try {
    await admin.from("prospeccao_logs").insert({
      linha_id: job.linha_id,
      job_id: job.id,
      user_id: job.user_id,
      modelo_gemini: modelo,
      tempo_ms: tempoMs,
      documento: job.link,
      resultado,
      detalhes,
    });
  } catch (e) {
    console.error("log falhou:", e);
  }
}

function extractJson(text: string): Record<string, any> {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/\{[\s\S]*\}/);
  const raw = m ? (m[1] || m[0]) : text;
  try { return JSON.parse(raw); } catch { return {}; }
}