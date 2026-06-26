// Converte registros do banco (balancete_consolidado) em ParsedFinancialData
// alimentando o bsDadosBuilder.
import type { ParsedFinancialData, ParsedRow, BalanceteEntry } from "./types";

interface ConsolidadoRow {
  conta: string;
  codigo?: string | null;   // BEx Extenso (quando presente)
  descricao: string;
  tipo: string;
  nivel: number;
  ano: number;
  mes: number;
  valor: number;
  saldo?: number | null;     // 🚨 Saldo Atual (preferido sobre `valor`)
  qtd_lancamentos?: number;
}

// Mapeia tipo do balancete_consolidado → ref1 sintético reconhecido pelo builder.
// (O balancete_consolidado já vem agrupado por conta + período; o adapter
//  expõe cada combinação como um ParsedRow. O REF1_MAP é facultativo
//  porque o resolver tem fallback regex via descrição.)
function tipoToCategoria(tipo: string): "dre" | "balanco" {
  if (tipo === "receita" || tipo === "despesa") return "dre";
  return "balanco";
}

export function consolidadoToParsed(
  rows: ConsolidadoRow[],
  filesByPeriod?: Map<string, string[]>,
): {
  parsed: ParsedFinancialData;
  entries: BalanceteEntry[];
} {
  const yearsSet = new Set<string>();
  const groups = new Map<string, ParsedRow & { _cat: "dre" | "balanco" }>();

  for (const r of rows) {
    const mesKey = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    yearsSet.add(mesKey);
    // 🚨 Chave do agrupamento: codigo (BEx Extenso) > conta. Garante que diferentes
    // descrições do mesmo código sejam consolidadas como uma única linha.
    const codigo = (r.codigo && /^\d+$/.test(String(r.codigo).trim())) ? String(r.codigo).trim() : null;
    const chaveContabil = codigo || r.conta;
    const key = `${chaveContabil}|${tipoToCategoria(r.tipo)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        conta: r.conta,
        codigo,
        descricao: r.descricao,
        ref1: undefined,
        values: {},
        _cat: tipoToCategoria(r.tipo),
      });
    }
    const g = groups.get(key)!;
    // 🚨 Saldo Atual (BEx) é fonte de verdade — fallback para `valor` (legado).
    const v = r.saldo != null && Number.isFinite(Number(r.saldo)) ? Number(r.saldo) : Number(r.valor || 0);
    g.values[mesKey] = (g.values[mesKey] || 0) + v;
  }

  const dre: ParsedRow[] = [];
  const balanco: ParsedRow[] = [];
  for (const g of groups.values()) {
    const { _cat, ...row } = g;
    (_cat === "dre" ? dre : balanco).push(row);
  }

  const years = Array.from(yearsSet).sort();
  const parsed: ParsedFinancialData = { years, dre, balanco };

  // Cada período vira N entries — uma por arquivo de origem (nome real).
  // Fallback: "consolidado_${y}" quando não houver arquivos rastreados.
  const entries: BalanceteEntry[] = [];
  for (const y of years) {
    const files = filesByPeriod?.get(y);
    if (files && files.length > 0) {
      for (const f of files) {
        entries.push({ fileName: f, mesReferencia: y });
      }
    } else {
      entries.push({ fileName: `consolidado_${y}`, mesReferencia: y });
    }
  }
  return { parsed, entries };
}
