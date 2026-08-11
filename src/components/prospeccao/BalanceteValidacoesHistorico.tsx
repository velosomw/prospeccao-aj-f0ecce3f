// Histórico de validações estruturadas persistidas em `balancete_validacoes`
// (popula automaticamente pelo edge `balancete-build`). Cada linha = 1 período.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListChecks, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Alerta { tipo?: string; severidade?: "baixa" | "media" | "alta"; mensagem?: string; diferenca?: number; tolerance?: number; }
interface Row {
  id: string; ano: number; mes: number;
  ativo_total: number; passivo_total: number; pl_total: number;
  diferenca: number; reconciled: boolean;
  confianca_global: number | null;
  alertas: Alerta[]; updated_at: string;
}

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const sevColor: Record<string, string> = {
  alta:  "hsl(0,84%,60%)",
  media: "hsl(38,92%,50%)",
  baixa: "hsl(217,91%,50%)",
};

interface Props { companyId: string | null; }

const BalanceteValidacoesHistorico = ({ companyId }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!companyId) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("balancete_validacoes")
      .select("id, ano, mes, ativo_total, passivo_total, pl_total, diferenca, reconciled, confianca_global, alertas, updated_at")
      .eq("company_id", companyId)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(24);
    if (!error) setRows((data || []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              Validações estruturadas por período
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Persistidas a cada execução do pipeline (`balancete_validacoes`). Tolerância 0,1% sobre o Ativo.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma validação registrada ainda. Execute o pipeline do balancete para popular.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-2">Período</th>
                  <th className="text-center px-2">Reconciliação</th>
                  <th className="text-right px-2">Ativo</th>
                  <th className="text-right px-2">Passivo+PL</th>
                  <th className="text-right px-2">Δ</th>
                  <th className="text-center px-2">Confiança</th>
                  <th className="text-left px-2">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const ppl = (r.passivo_total || 0) + (r.pl_total || 0);
                  const diffPct = r.ativo_total ? Math.abs(r.diferenca) / Math.abs(r.ativo_total) : 0;
                  const conf = r.confianca_global == null ? null : Math.round(Number(r.confianca_global) * 100);
                  return (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 px-2 font-medium">
                        {String(r.mes).padStart(2, "0")}/{r.ano}
                      </td>
                      <td className="text-center px-2">
                        {r.reconciled ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> OK
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-700 border-red-500/30 gap-1">
                            <AlertTriangle className="w-3 h-3" /> Quebrado
                          </Badge>
                        )}
                      </td>
                      <td className="text-right px-2">{fmtBRL(r.ativo_total)}</td>
                      <td className="text-right px-2">{fmtBRL(ppl)}</td>
                      <td className={`text-right px-2 ${diffPct > 0.001 ? "text-red-600 font-semibold" : ""}`}>
                        {fmtBRL(r.diferenca)} <span className="text-[10px] text-muted-foreground">({(diffPct * 100).toFixed(2)}%)</span>
                      </td>
                      <td className="text-center px-2">
                        {conf == null ? "—" : (
                          <Badge
                            className="border-0"
                            style={{
                              background: conf >= 70 ? "hsl(142,76%,36%)/15" : conf >= 50 ? "hsl(38,92%,50%)/15" : "hsl(0,84%,60%)/15",
                              color: conf >= 70 ? "hsl(142,76%,36%)" : conf >= 50 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)",
                            }}
                          >
                            {conf}%
                          </Badge>
                        )}
                      </td>
                      <td className="px-2">
                        {!r.alertas?.length ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.alertas.slice(0, 4).map((a, i) => {
                              const c = sevColor[a.severidade || "media"] || sevColor.media;
                              return (
                                <Badge key={i} className="border-0 text-[10px]"
                                       style={{ background: `${c}25`, color: c }}
                                       title={a.mensagem}>
                                  {a.tipo || "alerta"}
                                </Badge>
                              );
                            })}
                            {r.alertas.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">+{r.alertas.length - 4}</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BalanceteValidacoesHistorico;
