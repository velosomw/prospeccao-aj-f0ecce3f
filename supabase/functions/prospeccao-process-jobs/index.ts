// Processa jobs pendentes: baixa PDF do link, envia ao Gemini, extrai campos e atualiza a linha.
// Body: { limit?: number, job_id?: string }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
const MODELO_GEMINI = "gemini-1.5-flash";

const EXTRACTION_PROMPT = `Você é um Auditor Contábil e Jurídico Sênior da BEx. Sua missão é realizar a extração cognitiva de dados de processos judiciais conforme o MD - PARTE 4, MD-GEMINI-PROCESS-INTELLIGENCE-PANEL-001 e MD-DOCUMENT-FETCH-ENTERPRISE-ENGINE-001.

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

        if (job.status === "pendente") {
          const link = job.link as string;
          const tDown0 = Date.now();
          
          try {
            if (link.startsWith("storage://")) {
              storagePath = link.replace("storage://", "");
              const { data: file, error } = await admin.storage.from("prospeccao-uploads").download(storagePath);
              if (error) throw error;
              pdfBytes = new Uint8Array(await file.arrayBuffer());
            } else {
              // MD-DOCUMENT-FETCH-ENTERPRISE-ENGINE-001: Validação e Download Seguro
              const url = new URL(link);
              if (url.protocol !== "https:") throw new Error("URL_INVALIDA: Apenas HTTPS permitido");
              
              const resp = await fetch(link, { 
                redirect: "follow",
                headers: {
                  "User-Agent": "BEx-Document-Fetch-Engine/1.0",
                  "Accept": "application/pdf"
                }
              });
              
              if (!resp.ok) throw new Error(`DOWNLOAD_${resp.status}: HTTP ${resp.status}`);
              
              const contentType = resp.headers.get("content-type") || "";
              if (!contentType.includes("application/pdf")) {
                console.warn(`Aviso: Content-Type inesperado: ${contentType}`);
              }

              pdfBytes = new Uint8Array(await resp.arrayBuffer());
              
              if (pdfBytes.length === 0) throw new Error("PDF_INVALIDO: Arquivo vazio");

              if (!isHomologation) {
                storagePath = `${job.user_id}/temp/${job.id}.pdf`;
                const { error: upErr } = await admin.storage.from("prospeccao-uploads")
                  .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
                if (upErr) throw upErr;
              }
            }

            const downloadTime = Date.now() - tDown0;
            const hash = await sha256Hex(pdfBytes);

            // Log de Auditoria do Fetch Engine (MD-001 Parte 21)
            if (!isHomologation) {
              await admin.from("prospeccao_document_fetch_logs").insert({
                linha_id: job.linha_id,
                job_id: job.id,
                url: link,
                status_code: 200,
                file_size: pdfBytes.length,
                hash_sha256: hash,
                tempo_download_ms: downloadTime
              });

              await admin.from("prospeccao_pdf_jobs").update({
                status: "baixado", 
                storage_path: storagePath,
                doc_hash: hash,
                fetch_metadata: { download_ms: downloadTime, size: pdfBytes.length }
              }).eq("id", job.id);
            }
          } catch (fetchErr) {
            const errorMsg = String(fetchErr.message || fetchErr);
            if (!isHomologation) {
              await admin.from("prospeccao_document_fetch_logs").insert({
                linha_id: job.linha_id,
                job_id: job.id,
                url: link,
                error_code: errorMsg.split(":")[0],
                status_code: errorMsg.includes("HTTP") ? parseInt(errorMsg.match(/\d+/)?.[0] || "500") : 500
              });
            }
            throw fetchErr;
          }
        } else {
          if (!storagePath) throw new Error("Job baixado sem storage_path");
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
        const base64 = base64Encode(pdfBytes);
        
        const aiResult = await callLLM({
          prompt: EXTRACTION_PROMPT,
          system: "Você é um Auditor Sênior especializado em prospecção de Administração Judicial.",
          provider: GOOGLE_AI_API_KEY ? "gemini" : "lovable",
          model: MODELO_GEMINI,
          useCache: true,
          // Support multimodal by adding the PDF data to the prompt
          // We manually craft the Gemini multimodal payload here since llm-service callGemini is basic
          customBody: {
            contents: [{
              parts: [
                { text: EXTRACTION_PROMPT },
                { inlineData: { mimeType: "application/pdf", data: base64 } }
              ]
            }]
          }
        });

        const content = aiResult.text || "";
        const extracted = extractJson(content);
        const ws = extracted.workspace || {};

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

        await admin.from("prospeccao_workspace").insert({
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
        await admin.rpc('increment_prospeccao_metrics', {
          p_prioridade: (ws.score_comercial?.prioridade || 0) > 70 ? 'alta' : (ws.score_comercial?.prioridade || 0) > 30 ? 'media' : 'baixa',
          p_tem_aj: Boolean(ws.administrador_judicial)
        }).catch(e => console.error("Metrics update failed:", e));

        results.push({ job: job.id, ok: true, status: statusCert });
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        const statusErro = /gemini|download|http|pdf/i.test(msg) ? "Erro OCR" : "Revisão Manual";
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

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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