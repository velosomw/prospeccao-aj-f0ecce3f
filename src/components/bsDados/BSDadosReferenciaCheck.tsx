import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Target } from "lucide-react";
import dipRef from "@/data/dipEndividamentoReferencia.json";
import type { BSDadosRow } from "@/services/bsDadosBuilder";

/**
 * Compara linha-a-linha o BS&Dados construído pelo pipeline com o
 * balancete DIP de referência (Set/2025 → Mar/2026). Mostra Δ% para os
 * principais agregados patrimoniais. Tolerância contábil: 0,5%.
 */
const TOL = 0.005;


const fmt = (v?: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v < 0 ? `(${s})` : s;
};

const pct = (a: number, b: number) => (b === 0 ? 0 : (a - b) / Math.abs(b));

const cellTone = (delta: number) =>
  Math.abs(delta) <= TOL
    ? "text-emerald-700"
    : Math.abs(delta) <= 0.02
    ? "text-amber-700"
    : "text-red-700";

interface Props { rows: BSDadosRow[] }

const BSDadosReferenciaCheck = ({ rows }: Props) => {
  const cmp = useMemo(() => {
    const rowsByKey = new Map(rows.map(r => [r.mesKey, r]));
    return dipRef.meses.map(ref => {
      const r = rowsByKey.get(ref.mesKey);
      if (!r) {
        return { mesKey: ref.mesKey, mes: ref.mes, deltas: [], ok: false, missing: true, maxAbs: 0 };
      }
      const pares = [
        { label: "Ativo Total", real: r.ativo_total, refV: ref.resumo.ativo_total },
        { label: "AC", real: r.ativo_circulante, refV: ref.resumo.ativo_circulante },
        { label: "ANC", real: (r.ativo_total - r.ativo_circulante), refV: ref.resumo.ativo_nao_circulante },
        { label: "Passivo Total", real: r.passivo_total, refV: ref.resumo.passivo_total },
        { label: "PC", real: r.passivo_circulante, refV: ref.resumo.passivo_circulante },
        { label: "PNC", real: (r.passivo_total - r.passivo_circulante), refV: ref.resumo.passivo_nao_circulante },
        { label: "PL", real: r.patrimonio_liquido, refV: ref.resumo.patrimonio_liquido },
      ];
      const deltas = pares.map(p => ({ ...p, delta: pct(p.real, p.refV) }));
      const maxAbs = Math.max(...deltas.map(d => Math.abs(d.delta)));
      return { mesKey: ref.mesKey, mes: ref.mes, deltas, ok: maxAbs <= TOL, missing: false, maxAbs };
    });
  }, [rows]);

  if (!cmp.length) return null;

  const okCount = cmp.filter(c => c.ok).length;
  const missingCount = cmp.filter(c => c.missing).length;
  const headerLabels = ["Ativo Total","AC","ANC","Passivo Total","PC","PNC","PL"];

  return (
    <Card className="border-emerald-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            Comparativo vs. Balancete de Referência (DIP)
            <Badge variant="outline" className="text-[10px]">Set/25 → Mar/26</Badge>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {missingCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                {missingCount} mês{missingCount > 1 ? "es" : ""} sem dados extraídos
              </Badge>
            )}
            {okCount === cmp.length ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {okCount}/{cmp.length} meses dentro da tolerância (0,5%)
              </Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-1" /> {cmp.length - okCount}/{cmp.length} meses fora (Δ &gt; 0,5% ou sem dados)
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums">
            <thead className="bg-muted/40">
              <tr className="text-muted-foreground">
                <th className="text-left py-1.5 px-2 font-semibold">Mês</th>
                {headerLabels.map(l => (
                  <th key={l} className="text-right px-2 font-semibold">{l} (Δ%)</th>
                ))}
                <th className="text-center px-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {cmp.map(row => (
                <tr key={row.mesKey} className={`border-b border-border/20 hover:bg-muted/30 ${row.missing ? "bg-muted/20" : ""}`}>
                  <td className="py-1 px-2 font-medium">{row.mes}</td>
                  {row.missing
                    ? headerLabels.map(l => (
                        <td key={l} className="text-right px-2 text-muted-foreground/60">—</td>
                      ))
                    : row.deltas.map(d => (
                        <td key={d.label} className={`text-right px-2 ${cellTone(d.delta)}`}
                            title={`Real: ${fmt(d.real)} · Ref: ${fmt(d.refV)}`}>
                          {(d.delta * 100).toFixed(2).replace(".", ",")}%
                        </td>
                      ))}
                  <td className="text-center px-2">
                    {row.missing ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">sem dados</Badge>
                    ) : row.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Δ% = (Real − Referência) / |Referência|. Verde ≤ 0,5% · Âmbar ≤ 2% · Vermelho &gt; 2%.
          Fonte: <i>Relatório Mensal Detalhado — Composição do Endividamento</i> (gabarito DIP).
        </p>
      </CardContent>
    </Card>
  );
};

export default BSDadosReferenciaCheck;
