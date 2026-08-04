// Recebe upload (xlsx/csv/pdf) já no Storage e cria registros.
// Body: { storage_path: string, file_name: string, file_type: 'xlsx'|'csv'|'pdf' }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface XlsxRow {
  [k: string]: unknown;
}

// Mapeamento dos cabeçalhos do arquivo de processos para colunas da tabela
const HEADER_MAP: Record<string, string> = {
  "id servico": "id_servico",
  "n processo": "numero_processo",
  "n° processo": "numero_processo",
  "nº processo": "numero_processo",
  "numero processo": "numero_processo",
  "parte con principal - nome": "parte_con_nome",
  "parte con principal - cpf/cnpj": "parte_con_cnpj",
  "parte con principal - qualificação": "parte_con_qualif",
  "parte pro principal - nome": "parte_pro_nome",
  "parte pro principal - cpf/cnpj": "parte_pro_cnpj",
  "denominação": "denominacao",
  "órgão/tribunal": "orgao_tribunal",
  "orgao/tribunal": "orgao_tribunal",
  "esfera": "esfera",
  "instância": "instancia",
  "instancia": "instancia",
  "uf": "uf",
  "municipio": "municipio",
  "município": "municipio",
  "área judicial": "area_judicial",
  "area judicial": "area_judicial",
  "assunto judicial": "assunto_judicial",
  "ação judicial": "acao_judicial",
  "acao judicial": "acao_judicial",
  "valor pleito": "valor_pleito",
  "status do processo": "status_processo",
  "dt. inicio": "dt_inicio",
  "dt. início": "dt_inicio",
  "dt. cad. causa": "dt_cad_causa",
  "processo eletrônico?": "processo_eletronico",
  "processo eletronico?": "processo_eletronico",
  "link_documento": "link_documento",
  "link documento": "link_documento",
  // Novos mapeamentos para a planilha padrão de prospecção
  "data da distribuição": "dt_inicio",
  "empresa": "parte_pro_nome",
  "vara e comarca": "orgao_tribunal",
  "estado": "uf",
  "valor do passivo": "valor_pleito",
  "juiz / juíza": "pedidos_principais", // Mapeando juiz para pedidos_principais temporariamente se não houver coluna juiz
  "aj nomeado": "advogado_nome", // Mapeando AJ nomeado para advogado_nome
};

function normalizeHeader(h: string): string {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseBool(v: unknown): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "SIM" || s === "TRUE" || s === "1") return true;
  if (s === "NAO" || s === "NÃO" || s === "FALSE" || s === "0") return false;
  return null;
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseUser.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Token inválido" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const { storage_path, file_name, file_type } = body as {
      storage_path: string; file_name: string; file_type: string;
    };
    if (!storage_path || !file_name || !file_type) return json({ error: "Campos faltando" }, 400);

    const { data: uploadRow, error: insErr } = await admin.from("prospeccao_uploads").insert({
      user_id: user.id,
      file_name,
      file_type,
      storage_path,
      status: "processando",
    }).select().single();
    if (insErr) throw insErr;

    let rowsCount = 0;
    if (file_type === "xlsx" || file_type === "csv") {
      const { data: file, error: dlErr } = await admin.storage.from("prospeccao-uploads").download(storage_path);
      if (dlErr) throw dlErr;
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws, { defval: null });

      const seenRows = new Set<string>();
      const linhas = rows.map((r) => {
        const out: Record<string, unknown> = { user_id: user.id, upload_id: uploadRow.id };
        let rowIdentifier = "";
        
        for (const [k, v] of Object.entries(r)) {
          const col = HEADER_MAP[normalizeHeader(k)];
          if (!col) continue;
          
          let val: any = v;
          if (col === "valor_pleito") val = parseNumber(v);
          else if (col === "dt_inicio" || col === "dt_cad_causa") val = parseDate(v);
          else if (col === "processo_eletronico") val = parseBool(v);
          else val = v == null ? null : String(v);
          
          out[col] = val;
          // Cria um identificador único baseado no número do processo e empresa para remover duplicatas
          if (col === "numero_processo" || col === "parte_pro_nome") {
            rowIdentifier += String(val || "").toLowerCase().trim();
          }
        }
        
        if (rowIdentifier && seenRows.has(rowIdentifier)) {
          return null; // Marca para remoção
        }
        if (rowIdentifier) seenRows.add(rowIdentifier);
        
        if (!out.link_documento) out.ai_status = "sem_link";
        return out;
      }).filter(l => l !== null); // Remove duplicatas detectadas no lote atual

      // Insere em lotes
      for (let i = 0; i < linhas.length; i += 200) {
        const batch = linhas.slice(i, i + 200);
        const { data: inserted, error: linErr } = await admin
          .from("prospeccao_linhas")
          .insert(batch)
          .select("id, link_documento");
        if (linErr) throw linErr;

        // Cria jobs para linhas com link
        const jobs = (inserted || [])
          .filter((l) => l.link_documento && String(l.link_documento).trim())
          .map((l) => ({ linha_id: l.id, user_id: user.id, link: String(l.link_documento).trim() }));
        if (jobs.length) {
          const { error: jErr } = await admin.from("prospeccao_pdf_jobs").insert(jobs);
          if (jErr) throw jErr;
        }
        rowsCount += batch.length;
      }
    } else if (file_type === "pdf") {
      // PDF avulso: cria 1 linha + 1 job apontando para o storage_path local
      const { data: linha, error: linErr } = await admin.from("prospeccao_linhas").insert({
        user_id: user.id,
        upload_id: uploadRow.id,
        ai_status: "baixado",
      }).select().single();
      if (linErr) throw linErr;
      const { error: jErr } = await admin.from("prospeccao_pdf_jobs").insert({
        linha_id: linha.id,
        user_id: user.id,
        link: `storage://${storage_path}`,
        status: "baixado",
        storage_path,
      });
      if (jErr) throw jErr;
      rowsCount = 1;
    }

    await admin.from("prospeccao_uploads").update({
      status: "concluido", rows_count: rowsCount,
    }).eq("id", uploadRow.id);

    return json({ ok: true, upload_id: uploadRow.id, rows: rowsCount });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
