// Aba de snapshots mensais: gera e lista o histórico consolidado (Balancete + BS + DRE + Alertas).
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Camera, History, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRmaMonthlySnapshots } from "@/hooks/useRmaMonthlySnapshots";
import type { Competencia } from "@/components/prospeccao/CompetenciaSelector";

interface Props {
  companyId: string | null;
  periodo: Competencia | null;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ProspeccaoSnapshotMensalTab({ companyId, periodo }: Props) {
  const [motivo, setMotivo] = useState("");
  const { snapshots, loading, busy, create } = useRmaMonthlySnapshots(companyId);

  const ano = periodo?.ano;
  const mes = periodo?.mes;

  const ultimoDoMes = useMemo(() => {
    if (!ano || !mes) return null;
    return snapshots.find((s) => s.ano === ano && s.mes === mes) ?? null;
  }, [snapshots, ano, mes]);

  const handleCreate = async () => {
    if (!companyId || !ano || !mes) {
      toast.error("Selecione a competência (mês/ano) antes de gerar o snapshot.");
      return;
    }
    try {
      const res = await create({ ano, mes, motivo: motivo || undefined });
      if (res?.snapshot) {
        toast.success(`Snapshot mensal v${res.snapshot.versao} criado`, {
          description: `${res.snapshot.rows_balancete} contas · ${res.snapshot.rows_bs} BS · ${res.snapshot.rows_dre} DRE · ${res.snapshot.alerts_count} alertas`,
        });
        setMotivo("");
      }
    } catch (e: any) {
      toast.error("Falha ao criar snapshot mensal", { description: e?.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Geração */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Snapshot Mensal do Prospeccao
            {ano && mes && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {String(mes).padStart(2, "0")}/{ano}
              </Badge>
            )}
            {ultimoDoMes && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                Última versão: v{ultimoDoMes.versao} · {fmtDate(ultimoDoMes.created_at)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Captura uma fotografia consolidada do mês selecionado a partir das abas
            <strong> Balancete</strong>, <strong>Balanço Patrimonial</strong> e <strong>P&amp;L (DRE)</strong>,
            incluindo alertas e indicadores. Use para registro periódico, auditoria e comparativos.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Motivo / observação do snapshot (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="text-xs h-9"
            />
            <Button size="sm" className="gap-1.5" disabled={busy || !companyId || !ano || !mes} onClick={handleCreate}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              Gerar snapshot do mês
            </Button>
          </div>
          {(!ano || !mes) && (
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(38,92%,40%)]">
              <AlertTriangle className="w-3 h-3" />
              Selecione a competência no topo da página.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico completo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Histórico de Snapshots Mensais
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {snapshots.length} {snapshots.length === 1 ? "registro" : "registros"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" /> Carregando histórico…
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 opacity-40" />
              Nenhum snapshot mensal gerado ainda.
            </div>
          ) : (
            <ScrollArea className="h-[480px] border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                  <tr className="text-left">
                    <th className="py-2 px-2 font-semibold">Competência</th>
                    <th className="py-2 px-2 font-semibold">Versão</th>
                    <th className="py-2 px-2 font-semibold">Gerado em</th>
                    <th className="py-2 px-2 font-semibold text-right">% Prospeccao AJ</th>
                    <th className="py-2 px-2 font-semibold text-right">Bal/BS/DRE</th>
                    <th className="py-2 px-2 font-semibold text-right">Ativo Total</th>
                    <th className="py-2 px-2 font-semibold text-right">Receita</th>
                    <th className="py-2 px-2 font-semibold text-center">Alertas</th>
                    <th className="py-2 px-2 font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-semibold tabular-nums">
                        {String(s.mes).padStart(2, "0")}/{s.ano}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums">v{s.versao}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{fmtDate(s.created_at)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{s.percentual}%</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                        {s.rows_balancete}/{s.rows_bs}/{s.rows_dre}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {fmtBRL(s.resumo?.total_ativo)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {fmtBRL(s.resumo?.receita)}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {s.resumo?.alertas_bad ? (
                          <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,45%)] border-0 text-[9px]">
                            {s.resumo.alertas_bad} crit
                          </Badge>
                        ) : null}
                        {s.resumo?.alertas_warn ? (
                          <Badge className="ml-1 bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,40%)] border-0 text-[9px]">
                            {s.resumo.alertas_warn} alerta
                          </Badge>
                        ) : null}
                        {!s.resumo?.alertas_bad && !s.resumo?.alertas_warn && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground max-w-[260px] truncate" title={s.motivo || ""}>
                        {s.motivo || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
