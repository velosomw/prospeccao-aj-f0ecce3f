// ============================================================
// KpiDrillDown — abre detalhamento das contas que compõem
// um KPI ou série de gráfico. Sem dados mockados: usa as
// próprias linhas BS/DRE já carregadas pelo hook useBSPNL.
// ============================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BSRow, DRERow } from "@/hooks/useBSPNL";

export type DrillKey =
  | "liquidez_corrente" | "liquidez_geral" | "endividamento_total" | "endividamento_pl"
  | "capital_giro" | "margem_bruta" | "margem_ebitda" | "margem_liquida"
  | "roa" | "roe" | "receita" | "ebitda" | "result"
  | "ac" | "anc" | "pc" | "pnc" | "pl" | "at" | "pt";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  drill: DrillKey | null;
  bs: BSRow[];
  dre: DRERow[];
  periodoLabel?: string;
}

const fmt = (v: number) => {
  const s = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v < 0 ? `(${s})` : s;
};

interface Block {
  title: string;
  source: "BS" | "DRE";
  rows: { codigo: string; descricao: string; valor: number; nivel?: number }[];
  total: number;
  formula?: string;
  sign?: 1 | -1;
}

function bsRows(bs: BSRow[], sec: string, grupo?: string) {
  return bs
    .filter(r => r.secao === sec && (!grupo || r.grupo === grupo) && r.nivel <= 3)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
function dreRows(dre: DRERow[], cat: string) {
  return dre.filter(r => r.grupo === cat).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
const sumRows = (rs: { valor: number }[]) => rs.reduce((s, r) => s + Number(r.valor || 0), 0);

function buildBlocks(drill: DrillKey, bs: BSRow[], dre: DRERow[]): { blocks: Block[]; formula: string } {
  const ac  = bsRows(bs, "ativo", "circulante");
  const anc = bsRows(bs, "ativo", "nao_circulante");
  const pc  = bsRows(bs, "passivo", "circulante");
  const pnc = bsRows(bs, "passivo", "nao_circulante");
  const pl  = bsRows(bs, "pl");

  const blkAC  = (): Block => ({ title: "Ativo Circulante (AC)",        source: "BS",  rows: ac,  total: sumRows(ac) });
  const blkANC = (): Block => ({ title: "Ativo Não Circulante (ANC)",   source: "BS",  rows: anc, total: sumRows(anc) });
  const blkPC  = (): Block => ({ title: "Passivo Circulante (PC)",      source: "BS",  rows: pc,  total: sumRows(pc) });
  const blkPNC = (): Block => ({ title: "Passivo Não Circulante (PNC)", source: "BS",  rows: pnc, total: sumRows(pnc) });
  const blkPL  = (): Block => ({ title: "Patrimônio Líquido (PL)",      source: "BS",  rows: pl,  total: sumRows(pl) });

  const dreCat = (cat: string, title: string): Block => {
    const rs = dreRows(dre, cat);
    return { title, source: "DRE", rows: rs, total: sumRows(rs) };
  };

  switch (drill) {
    case "ac":  return { blocks: [blkAC()],  formula: "Σ Ativo Circulante (níveis ≤ 3)" };
    case "anc": return { blocks: [blkANC()], formula: "Σ Ativo Não Circulante" };
    case "pc":  return { blocks: [blkPC()],  formula: "Σ Passivo Circulante" };
    case "pnc": return { blocks: [blkPNC()], formula: "Σ Passivo Não Circulante" };
    case "pl":  return { blocks: [blkPL()],  formula: "Σ Patrimônio Líquido" };
    case "at":  return { blocks: [blkAC(), blkANC()], formula: "AT = AC + ANC" };
    case "pt":  return { blocks: [blkPC(), blkPNC()], formula: "PT = PC + PNC" };

    case "liquidez_corrente":
      return { blocks: [blkAC(), blkPC()], formula: "Liquidez Corrente = AC ÷ PC" };
    case "liquidez_geral":
      return { blocks: [blkAC(), blkANC(), blkPC(), blkPNC()], formula: "Liquidez Geral = (AC + ANC) ÷ (PC + PNC)" };
    case "capital_giro":
      return { blocks: [blkAC(), blkPC()], formula: "Capital de Giro = AC − PC" };
    case "endividamento_total":
      return { blocks: [blkPC(), blkPNC(), blkAC(), blkANC()], formula: "Endividamento = (PC + PNC) ÷ (AC + ANC)" };
    case "endividamento_pl":
      return { blocks: [blkPC(), blkPNC(), blkPL()], formula: "Endividamento/PL = (PC + PNC) ÷ PL" };
    case "roa":
      return {
        blocks: [
          dreCat("receita_bruta", "Receita Bruta"),
          dreCat("deducoes", "(−) Deduções"),
          dreCat("custos", "(−) Custos"),
          dreCat("despesas_operacionais", "(−) Despesas Operacionais"),
          dreCat("depreciacao", "(−) Depreciação"),
          dreCat("amortizacao", "(−) Amortização"),
          dreCat("resultado_financeiro", "Resultado Financeiro"),
          dreCat("impostos", "(−) Impostos"),
          blkAC(), blkANC(),
        ],
        formula: "ROA = Resultado Líquido ÷ (AC + ANC)",
      };
    case "roe":
      return {
        blocks: [
          dreCat("receita_bruta", "Receita Bruta"),
          dreCat("deducoes", "(−) Deduções"),
          dreCat("custos", "(−) Custos"),
          dreCat("despesas_operacionais", "(−) Despesas Operacionais"),
          dreCat("depreciacao", "(−) Depreciação"),
          dreCat("amortizacao", "(−) Amortização"),
          dreCat("resultado_financeiro", "Resultado Financeiro"),
          dreCat("impostos", "(−) Impostos"),
          blkPL(),
        ],
        formula: "ROE = Resultado Líquido ÷ PL",
      };
    case "receita":
      return {
        blocks: [dreCat("receita_bruta", "Receita Bruta"), dreCat("deducoes", "(−) Deduções")],
        formula: "Receita Líquida = Receita Bruta − Deduções",
      };
    case "margem_bruta":
      return {
        blocks: [
          dreCat("receita_bruta", "Receita Bruta"),
          dreCat("deducoes", "(−) Deduções"),
          dreCat("custos", "(−) Custos"),
        ],
        formula: "Margem Bruta = (Receita Líquida − Custos) ÷ Receita Líquida",
      };
    case "ebitda":
    case "margem_ebitda":
      return {
        blocks: [
          dreCat("receita_bruta", "Receita Bruta"),
          dreCat("deducoes", "(−) Deduções"),
          dreCat("custos", "(−) Custos"),
          dreCat("despesas_operacionais", "(−) Despesas Operacionais"),
        ],
        formula: drill === "ebitda"
          ? "EBITDA = Receita Líquida − Custos − Despesas Operacionais"
          : "Margem EBITDA = EBITDA ÷ Receita Líquida",
      };
    case "result":
    case "margem_liquida":
      return {
        blocks: [
          dreCat("receita_bruta", "Receita Bruta"),
          dreCat("deducoes", "(−) Deduções"),
          dreCat("custos", "(−) Custos"),
          dreCat("despesas_operacionais", "(−) Despesas Operacionais"),
          dreCat("depreciacao", "(−) Depreciação"),
          dreCat("amortizacao", "(−) Amortização"),
          dreCat("resultado_financeiro", "Resultado Financeiro"),
          dreCat("impostos", "(−) Impostos"),
        ],
        formula: drill === "result"
          ? "Resultado = EBITDA − Depreciação − Amortização + Resultado Financeiro − Impostos"
          : "Margem Líquida = Resultado ÷ Receita Líquida",
      };
  }
}

const TITLES: Record<DrillKey, string> = {
  liquidez_corrente: "Liquidez Corrente",
  liquidez_geral: "Liquidez Geral",
  endividamento_total: "Endividamento Total",
  endividamento_pl: "Endividamento sobre PL",
  capital_giro: "Capital de Giro",
  margem_bruta: "Margem Bruta",
  margem_ebitda: "Margem EBITDA",
  margem_liquida: "Margem Líquida",
  roa: "ROA — Retorno sobre o Ativo",
  roe: "ROE — Retorno sobre o PL",
  receita: "Receita Líquida",
  ebitda: "EBITDA",
  result: "Resultado Líquido",
  ac: "Ativo Circulante",
  anc: "Ativo Não Circulante",
  pc: "Passivo Circulante",
  pnc: "Passivo Não Circulante",
  pl: "Patrimônio Líquido",
  at: "Ativo Total",
  pt: "Passivo Total",
};

const KpiDrillDown = ({ open, onOpenChange, drill, bs, dre, periodoLabel }: Props) => {
  if (!drill) return null;
  const { blocks, formula } = buildBlocks(drill, bs, dre);
  const totalRows = blocks.reduce((s, b) => s + b.rows.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {TITLES[drill]}
            {periodoLabel && <Badge variant="secondary" className="text-[10px]">{periodoLabel}</Badge>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-mono">{formula}</span>
          </DialogDescription>
        </DialogHeader>

        {totalRows === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            Sem contas registradas para esta competência.
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {blocks.map((b, i) => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">{b.source}</Badge>
                      <span className="text-xs font-semibold">{b.title}</span>
                      <span className="text-[10px] text-muted-foreground">({b.rows.length} contas)</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums">{fmt(b.total)}</span>
                  </div>
                  {b.rows.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-muted-foreground italic">Sem lançamentos.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="text-[10px] text-muted-foreground border-b">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Código</th>
                          <th className="text-left px-3 py-1.5 font-medium">Descrição</th>
                          <th className="text-right px-3 py-1.5 font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map(r => (
                          <tr key={`${b.title}-${r.codigo}`} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1 font-mono text-[10px] text-muted-foreground">{r.codigo}</td>
                            <td className="px-3 py-1" style={{ paddingLeft: `${0.75 + ((r.nivel ?? 1) - 1) * 0.75}rem` }}>
                              {r.descricao}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums">{fmt(Number(r.valor))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default KpiDrillDown;
