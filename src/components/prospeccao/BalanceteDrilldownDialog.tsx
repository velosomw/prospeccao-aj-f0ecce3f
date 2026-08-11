import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  codigo: string | null;
  conta: string;
  descricao: string;
}

interface Lanc {
  id: string;
  ano: number;
  mes: number;
  valor: number | null;
  saldo: number | null;
  debito: number | null;
  credito: number | null;
  document_id: string | null;
  extraction_id: string | null;
  origem_arquivo: string | null;
  descricao_original: string | null;
  pagina: number | null;
  data_documento: string | null;
  confianca_ia: number | null;
  confianca_ocr: number | null;
  status: string | null;
}

const fmtBRL = (v?: number | null) => {
  if (v == null || isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const monthLabel = (a: number, m: number) => {
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[m - 1] || m}/${a}`;
};

export default function BalanceteDrilldownDialog({ open, onOpenChange, companyId, codigo, conta, descricao }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Lanc[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("lancamentos")
          .select("id, ano, mes, valor, saldo, debito, credito, document_id, extraction_id, origem_arquivo, descricao_original, pagina, data_documento, confianca_ia, confianca_ocr, status, codigo, conta")
          .eq("company_id", companyId)
          .order("ano", { ascending: true })
          .order("mes", { ascending: true });
        if (codigo) q = q.eq("codigo", codigo);
        else q = q.eq("conta", conta);
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setRows((data || []) as any);
      } catch (e) {
        console.error("[Drilldown] error", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId, codigo, conta]);

  // Agrupa por mês
  const grouped: Record<string, Lanc[]> = {};
  for (const r of rows) {
    const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    (grouped[k] ||= []).push(r);
  }
  const mesKeys = Object.keys(grouped).sort();

  const totalGeral = rows.reduce((s, r) => s + Number(r.saldo ?? r.valor ?? 0), 0);

  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            <span className="font-mono text-xs text-muted-foreground">{codigo || conta}</span>
            <span className="truncate">{descricao || conta}</span>
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{rows.length} lançamento(s)</Badge>
            <Badge variant="secondary">{mesKeys.length} mês(es)</Badge>
            <span>Total: <b className="text-foreground">{fmtBRL(totalGeral)}</b></span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> Carregando lançamentos…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem lançamentos individuais para esta conta.<br />
              O saldo pode vir de consolidação direta sem rastreio por linha.
            </div>
          )}
          {!loading && mesKeys.map(mk => {
            const list = grouped[mk];
            const [a, m] = mk.split("-").map(Number);
            const total = list.reduce((s, r) => s + Number(r.saldo ?? r.valor ?? 0), 0);
            const docs = new Set(list.map(l => l.document_id || l.origem_arquivo).filter(Boolean));
            const isOpen = expanded[mk] !== false; // default open
            return (
              <div key={mk} className="mb-3 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(mk)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-left"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold text-sm">{monthLabel(a, m)}</span>
                    <Badge variant="outline" className="text-[10px]">{list.length} linha(s)</Badge>
                    <Badge variant="outline" className="text-[10px]">{docs.size} doc(s)</Badge>
                  </div>
                  <span className="font-mono text-sm">{fmtBRL(total)}</span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-background border-b">
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1.5 px-2">Documento / Origem</th>
                          <th className="text-left px-2">Descrição</th>
                          <th className="text-right px-2">Débito</th>
                          <th className="text-right px-2">Crédito</th>
                          <th className="text-right px-2">Saldo</th>
                          <th className="text-center px-2">Conf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(l => (
                          <tr key={l.id} className="border-b border-border/10 hover:bg-muted/20">
                            <td className="py-1 px-2 max-w-[260px]">
                              <div className="truncate" title={l.origem_arquivo || l.document_id || ""}>
                                {l.origem_arquivo || l.document_id || "—"}
                              </div>
                              {l.pagina != null && (
                                <div className="text-[10px] text-muted-foreground">pág. {l.pagina}</div>
                              )}
                            </td>
                            <td className="px-2 max-w-[280px]">
                              <div className="truncate" title={l.descricao_original || ""}>
                                {l.descricao_original || "—"}
                              </div>
                            </td>
                            <td className="px-2 text-right font-mono">{fmtBRL(l.debito)}</td>
                            <td className="px-2 text-right font-mono">{fmtBRL(l.credito)}</td>
                            <td className="px-2 text-right font-mono">{fmtBRL(l.saldo ?? l.valor)}</td>
                            <td className="px-2 text-center">
                              {l.confianca_ia != null
                                ? <span className="text-[10px]">{Math.round(Number(l.confianca_ia) * 100)}%</span>
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
