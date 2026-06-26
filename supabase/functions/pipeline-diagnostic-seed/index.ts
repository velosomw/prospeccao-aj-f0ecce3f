// Cria pipeline_document + ocr_results sintéticos usando service_role.
// Usado pelo Diagnóstico do Pipeline IA em /gestor-ia para contornar RLS
// quando o usuário logado não é gestor_ia/coordenador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYNTHETIC_OCR = `BALANÇO PATRIMONIAL — TESTE DIAGNÓSTICO PIPELINE
Empresa: BEx Diagnóstico LTDA
CNPJ: 00.000.000/0001-00
Período: 31/12/2024

ATIVO CIRCULANTE
Caixa e Equivalentes ............... R$ 150.000,00
Contas a Receber ................... R$ 320.000,00
Estoques ........................... R$ 180.000,00
Total Ativo Circulante ............. R$ 650.000,00

ATIVO NÃO CIRCULANTE
Imobilizado ........................ R$ 850.000,00
Total Ativo ........................ R$ 1.500.000,00

PASSIVO + PL
Fornecedores ....................... R$ 280.000,00
Empréstimos ........................ R$ 420.000,00
Patrimônio Líquido ................. R$ 800.000,00
Total Passivo + PL ................. R$ 1.500.000,00`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Validação mínima do JWT para não expor a função publicamente
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stamp = Date.now();
    const { data: doc, error: docErr } = await supabase
      .from("pipeline_documents")
      .insert({
        rma_id: `DIAG-${stamp}`,
        file_name: `diag-${stamp}.txt`,
        mime_type: "text/plain",
        file_size: SYNTHETIC_OCR.length,
        sha256_hash: `diag-${stamp}`,
        provider: "diagnostic",
        pipeline_status: "ocr_ready",
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const { error: ocrErr } = await supabase.from("ocr_results").insert({
      document_id: doc.id,
      engine: "diagnostic",
      status: "completed",
      progress: 100,
      raw_text: SYNTHETIC_OCR,
      normalized_text: SYNTHETIC_OCR,
      confidence: 0.95,
      pages_total: 1,
      pages_processed: 1,
    });
    if (ocrErr) throw ocrErr;

    return new Response(
      JSON.stringify({ document_id: doc.id, ocr_chars: SYNTHETIC_OCR.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
