// Processa jobs pendentes: baixa PDF do link, envia ao Gemini, extrai campos e atualiza a linha.
// Body: { limit?: number, job_id?: string }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

const EXTRACTION_PROMPT = `Você é um Auditor Contábil e Jurídico Sênior da BEx. Sua missão é realizar a extração cognitiva de dados de processos judiciais de Recuperação Judicial ou Falência conforme o MD-GEMINI-EXTRACAO-PROSPECCAO-ADMINISTRADOR-JUDICIAL-001.

DIRETRIZES DE ANÁLISE:
1. NÃO SEJA APENAS UM OCR: Interprete a função jurídica de cada informação.
2. NÍVEIS DE COMPREENSÃO: Realize leitura física, compreensão estrutural, jurídica e semântica para produzir conhecimento estruturado.
3. CONCEITO DE EVIDÊNCIA: Identifique o bloco jurídico (Petição Inicial, Decisão, etc.) e a página de origem.
4. BUSINESS FACTS: Identifique quem é a Recuperanda/Empresa Prospectada, o Administrador Judicial nomeado, o Magistrado e os valores financeiros (Passivo/Valor da Causa).

SCHEMA DE RESPOSTA (JSON APENAS):
{
  "numero_processo": string|null,
  "tipo_acao": "Recuperação Judicial" | "Falência" | "Outro",
  "orgao_tribunal": string|null,
  "uf": string|null,
  "municipio": string|null,
  "parte_con_nome": string|null,
  "parte_pro_nome": string|null,
  "parte_pro_cnpj": string|null,
  "endereco_requerente": string|null,
  "advogado_nome": string|null,
  "advogado_oab": string|null,
  "data_protocolo": string|null,
  "valor_pleito": number|null,
  "status_processo": string|null,
  "pedidos_principais": string|null,
  "evidencia": {
    "pagina": number,
    "bloco": string,
    "confianca": number
  }
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

        const linhaUpdate: Record<string, unknown> = { ai_status: "extraido", ai_extracted: extracted };
        for (const k of [
          "numero_processo", "tipo_acao", "orgao_tribunal", "uf", "municipio",
          "parte_con_nome", "parte_pro_nome", "parte_pro_cnpj",
          "endereco_requerente", "advogado_nome", "advogado_oab",
          "data_protocolo", "valor_pleito", "status_processo", "pedidos_principais",
        ]) {
          const v = extracted?.[k];
          if (v != null && v !== "") linhaUpdate[k] = v;
        }

        await admin.from("prospeccao_linhas").update(linhaUpdate).eq("id", job.linha_id);
        await admin.from("prospeccao_pdf_jobs").update({
          status: "extraido", 
          extracted_json: extracted,
          metadata: {
            evidencia: extracted.evidencia,
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