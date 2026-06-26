// Fase 6 — utilitários para variação MoM / YoY a partir de séries por competência.
import type { BSRow, DRERow } from "@/hooks/useBSPNL";

const k = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
export const periodKey = k;

export function listPeriods<T extends { ano: number; mes: number }>(rows: T[]) {
  const seen = new Set<string>();
  const out: { ano: number; mes: number; key: string; label: string }[] = [];
  for (const r of rows) {
    const key = k(r.ano, r.mes);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ano: r.ano, mes: r.mes, key,
      label: new Date(r.ano, r.mes - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function inRange(p: { ano: number; mes: number }, from: string | null, to: string | null) {
  const key = k(p.ano, p.mes);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function bsTotalsByPeriod(rows: BSRow[]) {
  const map = new Map<string, { ano: number; mes: number; ativo: number; passivo: number; pl: number }>();
  for (const r of rows) {
    if (r.nivel > 2) continue;
    const key = k(r.ano, r.mes);
    if (!map.has(key)) map.set(key, { ano: r.ano, mes: r.mes, ativo: 0, passivo: 0, pl: 0 });
    const o = map.get(key)!;
    if (r.secao === "ativo") o.ativo += Number(r.valor || 0);
    else if (r.secao === "passivo") o.passivo += Number(r.valor || 0);
    else if (r.secao === "pl") o.pl += Number(r.valor || 0);
  }
  return map;
}

export function dreTotalsByPeriod(rows: DRERow[]) {
  // Soma simples por período usando os mesmos sinais do aggregate da aba P&L.
  const map = new Map<string, { ano: number; mes: number; receita_bruta: number; deducoes: number; custos: number; despesas: number; depreciacao: number; amortizacao: number; res_fin: number; impostos: number }>();
  for (const r of rows) {
    const key = k(r.ano, r.mes);
    if (!map.has(key)) map.set(key, { ano: r.ano, mes: r.mes, receita_bruta: 0, deducoes: 0, custos: 0, despesas: 0, depreciacao: 0, amortizacao: 0, res_fin: 0, impostos: 0 });
    const o = map.get(key)!;
    const v = Number(r.valor || 0);
    switch (r.grupo) {
      case "receita_bruta": o.receita_bruta += v; break;
      case "deducoes": o.deducoes += v; break;
      case "custos": o.custos += v; break;
      case "despesas_operacionais": o.despesas += v; break;
      case "depreciacao": o.depreciacao += v; break;
      case "amortizacao": o.amortizacao += v; break;
      case "resultado_financeiro": o.res_fin += v; break;
      case "impostos": o.impostos += v; break;
      default: o.despesas += v;
    }
  }
  return map;
}

export function dreDerived(t: { receita_bruta: number; deducoes: number; custos: number; despesas: number; depreciacao: number; amortizacao: number; res_fin: number; impostos: number }) {
  const receita_bruta = Math.abs(t.receita_bruta);
  const deducoes = -Math.abs(t.deducoes);
  const receita_liquida = receita_bruta + deducoes;
  const custos = -Math.abs(t.custos);
  const lucro_bruto = receita_liquida + custos;
  const despesas = -Math.abs(t.despesas);
  const ebitda = lucro_bruto + despesas;
  const dep = -Math.abs(t.depreciacao);
  const amo = -Math.abs(t.amortizacao);
  const rai = ebitda + dep + amo + t.res_fin;
  const imp = -Math.abs(t.impostos);
  const liq = rai + imp;
  return { receita_liquida, lucro_bruto, ebitda, resultado_liquido: liq };
}

export function previousMonthKey(ano: number, mes: number) {
  const d = new Date(ano, mes - 2, 1); // mes-2 = mes-1 zero-based
  return k(d.getFullYear(), d.getMonth() + 1);
}
export function previousYearKey(ano: number, mes: number) {
  return k(ano - 1, mes);
}
