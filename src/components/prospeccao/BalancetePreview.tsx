import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertCircle, CheckCircle2, Layers, Loader2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase-any";
import { fetchPivotConsolidado, type PivotRow, type PivotEquilibrio } from "@/services/bsDados/pivotConsolidado";
import BalanceteDrilldownDialog from "./BalanceteDrilldownDialog";

interface Props {
  companyId: string;
  prospeccaoId: string | null;
  ano: number;
  mes: number;
  consolidado: any[];
}

const fmtBRL = (v?: number | null) => {
  if (v == null || isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtNum = (v?: number | null) => {
  if (v == null || isNaN(Number(v)) || Number(v) === 0) return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthLabel = (mk: string) => {
  const [y, m] = mk.split("-");
  const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${names[Number(m) - 1] || m} ${y}`;
};


interface SourceFile {
  file_name: string;
  classe: string | null;
  status: string | null;
}

const BalancetePreview = ({ companyId, prospeccaoId }: Props) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PivotRow[]>([]);
  const [mesKeys, setMesKeys] = useState<string[]>([]);
  const [equilibrio, setEquilibrio] = useState<PivotEquilibrio[]>([]);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [drill, setDrill] = useState<{ codigo: string | null; conta: string; descricao: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchPivotConsolidado(companyId);
        if (cancelled) return;
        setRows(res.rows);
        setMesKeys(res.mesKeys);
        setEquilibrio(res.equilibrio);
      } catch (e) {
        console.error("[BalancetePreview] pivot error", e);
      }
      // Lista dos arquivos-fonte que originaram o balancete (nome real do OneDrive)
      if (prospeccaoId) {
        const { data: extr } = await supabase
          .from("ai_extractions")
          .select("document_id, classe, status")
          .eq("prospeccao_id", prospeccaoId)
          .in("classe", ["BALANCETE", "DRE", "DEMONSTRACAO_RESULTADO", "DFC", "BALANCO"]);
        const docIds = Array.from(new Set((extr || []).map((e: any) => e.document_id).filter(Boolean)));
        let files: SourceFile[] = [];
        if (docIds.length > 0) {
          const { data: docs } = await supabase
            .from("pipeline_documents")
            .select("id, file_name")
            .in("id", docIds);
          const byId = new Map((docs || []).map((d: any) => [d.id, d.file_name as string]));
          const seen = new Set<string>();
          for (const e of (extr || []) as any[]) {
            const fn = byId.get(e.document_id) as string;
            if (!fn || seen.has(fn)) continue;
            seen.add(fn);
            files.push({ file_name: fn, classe: e.classe as string as string, status: e.status as string as string });
          }
          files.sort((a, b) => a.file_name.localeCompare(b.file_name));
        }
        if (!cancelled) setSourceFiles(files);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, prospeccaoId]);

  // Visão hierárquica plana ordenada por código contábil (espelha aba BALANCETES do XLSX).
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ca = a.codigo || a.conta || "";
      const cb = b.codigo || b.conta || "";
      // Ordenação numérica por código contábil (1, 11, 111, 1110100001, 2, ...)
      return ca.localeCompare(cb, undefined, { numeric: true });
    });
  }, [rows]);

  const lastMes = mesKeys.length > 0 ? mesKeys[mesKeys.length - 1] : null;
  const lastEq = lastMes ? equilibrio.find(e => e.mesKey === lastMes) : null;

  const empty = rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho acumulado */}
      <Card className="border-[hsl(217,91%,50%)]/30">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                Preview Balancete — Acumulado {mesKeys.length > 0 ? `(${mesKeys.length} meses)` : ""}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Visão consolidada por código contábil × mês · {rows.length} contas
                {sourceFiles.length > 0 && ` · ${sourceFiles.length} arquivo(s)-fonte`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loading && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Carregando</Badge>}
              {!loading && lastEq && (
                lastEq.ok ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> A = P+PL OK ({monthLabel(lastEq.mesKey)})
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                    <AlertCircle className="w-3 h-3 mr-1" /> Δ {fmtBRL(lastEq.diff)} ({monthLabel(lastEq.mesKey)})
                  </Badge>
                )
              )}
              {!loading && empty && (
                <Badge variant="secondary" className="text-[10px]">
                  <Layers className="w-3 h-3 mr-1" /> Sem dados consolidados
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Equilíbrio por mês */}
      {equilibrio.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Equação contábil por mês (Ativo = Passivo + PL)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2">Período</th>
                    <th className="text-right px-2">Ativo</th>
                    <th className="text-right px-2">Passivo</th>
                    <th className="text-right px-2">PL</th>
                    <th className="text-right px-2">Δ</th>
                    <th className="text-right px-2">%</th>
                    <th className="text-center px-2 w-16">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {equilibrio.map(e => (
                    <tr key={e.mesKey} className="border-b border-border/10">
                      <td className="py-1.5 px-2 font-medium">{monthLabel(e.mesKey)}</td>
                      <td className="px-2 text-right font-mono">{fmtBRL(e.ativo)}</td>
                      <td className="px-2 text-right font-mono">{fmtBRL(e.passivo)}</td>
                      <td className="px-2 text-right font-mono">{fmtBRL(e.patrimonio_liquido)}</td>
                      <td className="px-2 text-right font-mono">{fmtBRL(e.diff)}</td>
                      <td className="px-2 text-right font-mono">{(e.diff_pct * 100).toFixed(2)}%</td>
                      <td className="px-2 text-center">
                        {e.ok
                          ? <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-600" />
                          : <AlertCircle className="w-3.5 h-3.5 inline text-amber-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Arquivos-fonte (nomes reais do OneDrive que originaram o balancete) */}
      {sourceFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              Documentos-fonte processados ({sourceFiles.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Arquivos do OneDrive que alimentaram este Balancete, BS e P&amp;L.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2 px-3">Arquivo</th>
                    <th className="text-left px-3 w-32">Classe</th>
                    <th className="text-left px-3 w-32">Status IA</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceFiles.map((f) => (
                    <tr key={f.file_name} className="border-b border-border/10">
                      <td className="py-1.5 px-3 font-mono text-[11px]">{f.file_name}</td>
                      <td className="px-3"><Badge variant="outline" className="text-[10px]">{f.classe || "—"}</Badge></td>
                      <td className="px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${f.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                            : f.status === "failed"
                              ? "bg-red-500/10 text-red-700 border-red-500/30"
                              : "bg-amber-500/10 text-amber-700 border-amber-500/30"}`}
                        >
                          {f.status || "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela hierárquica código × mês — espelha aba BALANCETES.xlsx */}
      {!empty && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Balancete acumulado · Código × Mês</CardTitle>
            <p className="text-xs text-muted-foreground">
              Estrutura idêntica à aba <b>BALANCETES</b> do XLSX — saldos acumulados período a período, ordenados pela hierarquia natural do código contábil.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10 shadow-sm">
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2 w-32">Conta</th>
                    <th className="text-left px-2 min-w-[280px]">Descrição</th>
                    {mesKeys.map(mk => (
                      <th key={mk} className="text-right px-2 whitespace-nowrap">{monthLabel(mk)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const code = r.codigo || r.conta || "";
                    const len = code.length;
                    // Hierarquia BEx: 1=raiz, 2=grupo, 3=subgrupo, 6=conta, 10=folha
                    const isRoot = len <= 3;
                    const isMid = len > 3 && len < 10;
                    const indent = isRoot ? 0 : isMid ? 12 : 24;
                    const weight = isRoot ? "font-bold" : isMid ? "font-semibold" : "font-normal";
                    const bg = isRoot ? "bg-muted/40" : isMid ? "bg-muted/15" : "";
                    return (
                      <tr
                        key={code}
                        onClick={() => setDrill({ codigo: r.codigo, conta: r.conta, descricao: r.descricao || r.conta })}
                        title="Ver lançamentos / documentos que originaram este saldo"
                        className={`border-b border-border/10 hover:bg-[hsl(217,91%,50%)]/10 cursor-pointer ${bg} ${weight}`}
                      >
                        <td className="py-1 px-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{code}</td>
                        <td className="px-2" style={{ paddingLeft: 8 + indent }}>{r.descricao || r.conta}</td>
                        {mesKeys.map(mk => (
                          <td key={mk} className="px-2 text-right font-mono whitespace-nowrap">{fmtNum(r.values[mk])}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {empty && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Sem balancete consolidado em nenhum período.<br />
            Execute <b>Atualizar Status IA</b> na aba Status Prospeccao para extrair e consolidar a partir dos arquivos do OneDrive.
          </CardContent>
        </Card>
      )}

      {drill && (
        <BalanceteDrilldownDialog
          open={!!drill}
          onOpenChange={(v) => { if (!v) setDrill(null); }}
          companyId={companyId}
          codigo={drill.codigo}
          conta={drill.conta}
          descricao={drill.descricao}
        />
      )}
    </div>
  );
};

export default BalancetePreview;
