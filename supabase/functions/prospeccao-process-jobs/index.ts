// Processa jobs pendentes: baixa PDF do link, envia ao Gemini, extrai campos e atualiza a linha.
// Body: { limit?: number, job_id?: string }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

const EXTRACTION_PROMPT = `Você é um Auditor Contábil e Jurídico Sênior da BEx. Sua missão é realizar a extração cognitiva de dados de processos judiciais conforme o MD - PARTE 4.

OBJETIVO: Interpretar todos os valores jurídicos e gerar um modelo único de dados (Workspace).

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

    let query = admin.from("prospeccao_pdf_jobs").select("*").in("status", ["pendente", "baixado"]).limit(limit);
    if (onlyJob) query = admin.from("prospeccao_pdf_jobs").select("*").eq("id", onlyJob);
    const { data: jobs, error: qErr } = await query;
    if (qErr) throw qErr;

    const results: unknown[] = [];

    for (const job of jobs || []) {
      try {
        let pdfBytes: Uint8Array | null = null;
        let storagePath = job.storage_path as string | null;

        if (job.status === "pendente") {
          const link = job.link as string;
          if (link.startsWith("storage://")) {
            storagePath = link.replace("storage://", "");
            const { data: file, error } = await admin.storage.from("prospeccao-uploads").download(storagePath);
            if (error) throw error;
            pdfBytes = new Uint8Array(await file.arrayBuffer());
          } else {
            const resp = await fetch(link, { redirect: "follow" });
            if (!resp.ok) throw new Error(`Download falhou: HTTP ${resp.status}`);
            pdfBytes = new Uint8Array(await resp.arrayBuffer());
            storagePath = `${job.user_id}/temp/${job.id}.pdf`;
            const { error: upErr } = await admin.storage.from("prospeccao-uploads")
              .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
            if (upErr) throw upErr;
          }
          await admin.from("prospeccao_pdf_jobs").update({
            status: "baixado", storage_path: storagePath,
          }).eq("id", job.id);
        } else {
          if (!storagePath) throw new Error("Job baixado sem storage_path");
          const { data: file, error } = await admin.storage.from("prospeccao-uploads").download(storagePath);
          if (error) throw error;
          pdfBytes = new Uint8Array(await file.arrayBuffer());
        }

        const base64 = base64Encode(pdfBytes);

        const aiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: EXTRACTION_PROMPT },
                { inlineData: { mimeType: "application/pdf", data: base64 } }
              ]
            }],
            generationConfig: { responseMimeType: "application/json" }
          }),
        });
        const aiText = await aiResp.text();
        if (!aiResp.ok) throw new Error(`Gemini ${aiResp.status}: ${aiText.slice(0, 300)}`);
        const aiJson = JSON.parse(aiText);
        const content = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const extracted = extractJson(content);
        const ws = extracted.workspace || {};
        
        // 1. Atualizar a linha principal (Legacy/Sync)
        const linhaUpdate: Record<string, unknown> = { 
          ai_status: "extraido", 
          ai_extracted: extracted,
          numero_processo: ws.processo || null,
          parte_pro_nome: ws.empresa || null,
          orgao_tribunal: ws.vara ? `${ws.vara} - ${ws.comarca}` : ws.comarca,
          uf: ws.estado || null,
          municipio: ws.comarca || null,
          valor_pleito: ws.valor_exportacao || null,
          tipo_acao: ws.tipo_processo || null,
          pedidos_principais: `Juiz: ${ws.juiz || 'N/A'} | AJ: ${ws.administrador_judicial || 'N/A'}`
        };

        await admin.from("prospeccao_linhas").update(linhaUpdate).eq("id", job.linha_id);

        // 2. Gerenciar Versionamento no Workspace
        const { data: latestVersao } = await admin
          .from("prospeccao_workspace")
          .select("versao")
          .eq("linha_id", job.linha_id)
          .order("versao", { ascending: false })
          .limit(1)
          .single();
        
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
          raw_response: extracted,
          created_by: job.user_id
        });

        // 3. Finalizar Job
        await admin.from("prospeccao_pdf_jobs").update({
          status: "extraido", 
          extracted_json: extracted,
          metadata: {
            versao: proximaVersao,
            processed_at: new Date().toISOString()
          }
        }).eq("id", job.id);

        results.push({ job: job.id, ok: true });
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        await admin.from("prospeccao_pdf_jobs").update({
          status: "erro", error: msg, attempts: (job.attempts || 0) + 1,
        }).eq("id", job.id);
        await admin.from("prospeccao_linhas").update({
          ai_status: "erro", ai_error: msg,
        }).eq("id", job.linha_id);
        results.push({ job: job.id, ok: false, error: msg });
      }
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

function extractJson(text: string): Record<string, any> {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/\{[\s\S]*\}/);
  const raw = m ? (m[1] || m[0]) : text;
  try { return JSON.parse(raw); } catch { return {}; }
}