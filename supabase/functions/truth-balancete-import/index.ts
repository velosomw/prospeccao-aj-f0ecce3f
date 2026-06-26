// truth-balancete-import — importa um XLSX de balancete (layout Agrosys/AgroWeb)
// como "fonte da verdade" para um RMA/mês específicos. Usa "Saldo Anterior"
// quando o RMA-alvo é o mês anterior ao arquivo (ex.: 12-2025 → 11-2025).
//
// POST {
//   file_id: string,                // onedrive file_id
//   rma_id: string,                 // ex. "RMA-DIP-11-2025"
//   company_id: string (uuid),
//   ano: number, mes: number,       // período-alvo (verdade)
//   use_column?: "Saldo Anterior" | "Saldo Atual" (default: "Saldo Anterior")
// }

import { graphApp, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

function toNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  // sufixo D/C (Nardelli)
  let sign = 1;
  const suf = s.match(/\s*([DC])\s*$/i);
  if (suf) {
    sign = suf[1].toUpperCase() === "C" ? -1 : 1;
    s = s.replace(/\s*[DC]\s*$/i, "");
  }
  // pt-BR: "1.234.567,89"
  s = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * sign : 0;
}

// Mapeia o primeiro dígito do código → grupo contábil (padrão BR)
function classifyByCode(codigo: string): { grupo: string; sinal: 1 | -1 } {
  const c = (codigo || "").trim();
  const d = c.charAt(0);
  switch (d) {
    case "1": return { grupo: "ATIVO", sinal: 1 };
    case "2": return { grupo: "PASSIVO_PL", sinal: 1 }; // refinaremos PL via 2.3+
    case "3": return { grupo: "RECEITA", sinal: 1 };
    case "4": return { grupo: "CUSTO", sinal: 1 };
    case "5": return { grupo: "DESPESA", sinal: 1 };
    case "6": return { grupo: "DESPESA", sinal: 1 };
    case "7": return { grupo: "RESULTADO", sinal: 1 };
    default:  return { grupo: "OUTROS", sinal: 1 };
  }
}

// Heurística: índice de "Patrimônio Líquido" geralmente começa 2.3, 2.4 ou descrição
function isPL(codigo: string, descricao: string): boolean {
  const c = (codigo || "").trim();
  if (/^2\.[3-9]/.test(c)) return true;
  return /patrim[oô]nio\s+l[ií]quido|capital\s+social|reserva|prejuiz|lucros?\s+acumulad/i
    .test(descricao || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      file_id, rma_id, company_id, ano, mes,
      use_column = "Saldo Anterior",
    } = body || {};

    if (!file_id || !rma_id || !company_id || !ano || !mes) {
      return new Response(JSON.stringify({ error: "Faltam: file_id, rma_id, company_id, ano, mes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Resolve tracker
    const trkResp = await sb(`/onedrive_files?file_id=eq.${file_id}&select=*&limit=1`);
    const trk = (await trkResp.json())[0];
    if (!trk) throw new Error(`onedrive_files não encontrado para file_id=${file_id}`);
    const driveId = trk.drive_id;
    const fileName = trk.file_name || file_id;

    // 2) Download via Graph
    const { userUpn } = getAppCreds();
    const azure = (await import("../_shared/graph-app.ts")) as any;
    const accessToken = await azure.getAppToken();
    const contentUrls = [
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file_id}/content`,
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}/drive/items/${file_id}/content`,
    ];
    let bytes: Uint8Array | null = null;
    let lastErr = "";
    for (const u of contentUrls) {
      const r = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow" });
      if (r.ok) { bytes = new Uint8Array(await r.arrayBuffer()); break; }
      lastErr = `${r.status} ${r.statusText}`;
    }
    if (!bytes) throw new Error(`Falha ao baixar do OneDrive: ${lastErr}`);

    // 3) Parse XLSX
    const XLSX = await import("npm:xlsx@0.18.5");
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });

    type Row = {
      sheet: string; codigo: string; descricao: string;
      valor: number; grupo: string; is_pl: boolean;
    };
    const rows: Row[] = [];
    let detectedHeader: string[] = [];
    let valueColIdx = -1;

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1, raw: true, defval: null,
      }) as any[][];
      if (!matrix.length) continue;

      // Aliases tolerantes para a coluna de valor desejada
      const colAliases: Record<string, string[]> = {
        "saldo anterior": ["saldo anterior", "saldo inicial", "saldo incial", "saldo inic", "anterior", "inicial", "incial"],
        "saldo atual":    ["saldo atual", "saldo final", "saldo final r$", "atual", "final"],
      };
      const targets = colAliases[use_column.toLowerCase()] || [use_column.toLowerCase()];

      // Procura linha de header
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(matrix.length, 25); i++) {
        const r = (matrix[i] || []).map((c) => String(c ?? "").trim().toLowerCase());
        if (r.some((c) => targets.some((t) => c.includes(t)))) {
          headerRowIdx = i; break;
        }
      }
      if (headerRowIdx < 0) continue;

      const header = (matrix[headerRowIdx] || []).map((c) => String(c ?? "").trim());
      detectedHeader = header;
      const lower = header.map((c) => c.toLowerCase());

      // Coluna do código: prioriza "cta.estrut" / "estrut"; depois "código"; por fim "conta"
      let codCol = lower.findIndex((c) => c.includes("estrut") || c.includes("cta."));
      if (codCol < 0) codCol = lower.findIndex((c) => c.includes("código") || c.includes("codigo") || c.includes("cód"));
      if (codCol < 0) codCol = lower.findIndex((c) => c === "conta");

      // Descrição
      let descCol = lower.findIndex((c) => c.includes("descrição") || c.includes("descricao") || c.includes("histórico") || c.includes("historico"));
      if (descCol < 0 || descCol === codCol) descCol = codCol + 2;

      // Valor
      valueColIdx = lower.findIndex((c) => targets.some((t) => c.includes(t)));
      if (codCol < 0 || valueColIdx < 0) continue;

      // Coluna D/C imediatamente após a coluna de valor (Agrosys: 9 colunas)
      const sufixCol = (valueColIdx + 1 < lower.length && (lower[valueColIdx + 1] === "d/c" || lower[valueColIdx + 1] === "natureza"))
        ? valueColIdx + 1 : -1;

      for (let i = headerRowIdx + 1; i < matrix.length; i++) {
        const r = matrix[i] || [];
        const codigo = String(r[codCol] ?? "").trim();
        if (!codigo || /^total/i.test(codigo)) continue;
        // Aceita códigos com pontos (ex. 1.1.01.001.001)
        if (!/^[0-9]+(\.[0-9A-Za-z]+)*$/.test(codigo)) continue;
        const descricao = String(r[descCol] ?? "").trim().replace(/^\.+/, "");
        let raw = r[valueColIdx];
        if (sufixCol > 0 && r[sufixCol]) raw = `${raw}${String(r[sufixCol]).trim().toUpperCase()}`;
        const valor = toNumber(raw);
        if (valor === 0) continue;
        const { grupo } = classifyByCode(codigo);
        rows.push({
          sheet: sheetName, codigo, descricao, valor,
          grupo, is_pl: grupo === "PASSIVO_PL" && isPL(codigo, descricao),
        });
      }
    }

    if (!rows.length) {
      // Dump preview de cada aba para debug
      const preview: Record<string, any[][]> = {};
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws) continue;
        const m = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
        preview[sn] = m.slice(0, 20);
      }
      return new Response(JSON.stringify({
        error: "Nenhuma linha extraída", header_detectado: detectedHeader, use_column,
        sheets: wb.SheetNames, preview,
      }, null, 2), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4) Totais: pega DIRETO das linhas-totais do arquivo (códigos de 1 dígito).
    // Isso evita dupla-contagem das folhas e respeita os subtotais oficiais.
    // Descarta classes de compensação (>= 7).
    const codes = new Set(rows.map((r) => r.codigo));
    const isLeaf = (c: string) => ![...codes].some((o) => o !== c && o.startsWith(c + "."));
    const leaves = rows.filter((r) => isLeaf(r.codigo) && !/^[789]/.test(r.codigo));

    const byCode = new Map(rows.map((r) => [r.codigo, r]));
    const pickAbs = (...candidates: string[]) => {
      for (const c of candidates) {
        const r = byCode.get(c);
        if (r) return Math.abs(r.valor);
      }
      return 0;
    };
    // Plano Agrosys típico: 1=ATIVO, 2=PASSIVO+PL, 2.3=PL, 3=RECEITAS, 4=CUSTOS, 5=DESPESAS
    const ativo   = pickAbs("1");
    const totalP  = pickAbs("2");
    let   pl      = pickAbs("2.3", "2.4");
    if (!pl) {
      // Soma manual de leaves PL se não houver linha-total
      for (const r of leaves) if (r.is_pl) pl += Math.abs(r.valor);
    }
    const passivo = Math.max(0, totalP - pl);
    const receita = pickAbs("3");
    const custo   = pickAbs("4");
    const despesa = pickAbs("5") + pickAbs("6");
    const resultado = 0;
    const lucro_liquido = receita - custo - despesa + resultado;

    // 5) Persiste snapshot da verdade (versao = max+1)
    const run_id = crypto.randomUUID();
    const vResp = await sb(`/balancete_snapshots?company_id=eq.${company_id}&ano=eq.${ano}&mes=eq.${mes}&select=versao&order=versao.desc&limit=1`);
    const vRows = await vResp.json();
    const nextVersao = ((vRows?.[0]?.versao as number) || 0) + 1;
    const snapResp = await sb(`/balancete_snapshots`, {
      method: "POST",
      body: JSON.stringify([{
        company_id, rma_id, ano, mes,
        versao: nextVersao, scope: "mes",
        origem: "truth_balancete_import",
        motivo: `Importado de ${fileName} (coluna="${use_column}")`,
        run_id,
        rows_balancete: leaves.length,
        rows_bs: 0, rows_dre: 0,
        payload: {
          source_file: fileName, file_id, use_column,
          header_detectado: detectedHeader,
          totais: {
            ativo_total: ativo,
            passivo_total: passivo,
            patrimonio_liquido: pl,
            passivo_mais_pl: passivo + pl,
            equacao_diff: ativo - (passivo + pl),
            receita_bruta: receita,
            custos: custo,
            despesas: despesa,
            lucro_liquido,
          },
          rows: leaves,
        },
      }]),
    });
    const snap = await snapResp.json();
    if (!snapResp.ok) throw new Error(`Falha ao gravar snapshot: ${JSON.stringify(snap).slice(0, 400)}`);

    // 6) Upsert rma_period_analyses (verdade do período)
    const balanco = {
      ativo_total: ativo,
      passivo_total: passivo,
      patrimonio_liquido: pl,
      passivo_mais_pl: passivo + pl,
      origem: "truth_balancete",
      source_file: fileName,
    };
    const dre = {
      receita_bruta: receita,
      custos: custo,
      despesas: despesa,
      lucro_liquido,
      origem: "truth_balancete",
    };
    const periodResp = await sb(
      `/rma_period_analyses?on_conflict=company_id,year,month`,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{
          company_id, year: ano, month: mes,
          period_label: `${String(mes).padStart(2, "0")}/${ano}`,
          status: "consolidado",
          balanco, dre,
          log: [`[${new Date().toISOString()}] truth-balancete-import (${fileName}, col=${use_column}) rows=${leaves.length}`],
        }]),
      },
    );
    const period = await periodResp.json();

    // 7) Diff vs consolidação anterior (ai_extractions)
    const extResp = await sb(
      `/ai_extractions?rma_id=eq.${rma_id}&status=eq.completed&classe=eq.BALANCETE&select=id,extracted_data,partial_results,classe&limit=200`,
    );
    const exts = await extResp.json();
    const consolidatedSum = { ativo: 0, passivo: 0, pl: 0, receita: 0, lucro: 0 };
    for (const e of exts) {
      const c = e?.partial_results?.consolidation?.raw_metrics || {};
      consolidatedSum.ativo   += Number(c.ativo_total || 0);
      consolidatedSum.passivo += Number(c.passivo_total || 0);
      consolidatedSum.pl      += Number(c.pl || 0);
      consolidatedSum.receita += Number(c.receita_liquida || 0);
      consolidatedSum.lucro   += Number(c.lucro_liquido || 0);
    }

    const divergencia = {
      ativo:   { verdade: ativo,    pipeline: consolidatedSum.ativo,   diff: ativo    - consolidatedSum.ativo },
      passivo: { verdade: passivo,  pipeline: consolidatedSum.passivo, diff: passivo  - consolidatedSum.passivo },
      pl:      { verdade: pl,       pipeline: consolidatedSum.pl,      diff: pl       - consolidatedSum.pl },
      receita: { verdade: receita,  pipeline: consolidatedSum.receita, diff: receita  - consolidatedSum.receita },
      lucro:   { verdade: lucro_liquido, pipeline: consolidatedSum.lucro, diff: lucro_liquido - consolidatedSum.lucro },
    };

    return new Response(JSON.stringify({
      ok: true,
      snapshot_id: snap?.[0]?.id ?? null,
      period_id: period?.[0]?.id ?? null,
      run_id,
      file: fileName,
      use_column,
      sheets: wb.SheetNames,
      header_detectado: detectedHeader,
      linhas_extraidas: rows.length,
      linhas_folha: leaves.length,
      totais: {
        ativo_total: ativo,
        passivo_total: passivo,
        patrimonio_liquido: pl,
        passivo_mais_pl: passivo + pl,
        equacao_diff: ativo - (passivo + pl),
        equacao_ok: Math.abs(ativo - (passivo + pl)) / Math.max(1, ativo) < 0.01,
        receita_bruta: receita,
        custos: custo, despesas: despesa,
        lucro_liquido,
      },
      divergencia_vs_pipeline: divergencia,
      extracoes_pipeline_comparadas: exts.length,
    }, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
