import { InteligenciaExecutivaPanel } from "@/components/prospeccao/InteligenciaExecutivaPanel";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ConsultorPageShell from "@/components/consultor/PageShell";
import {
  listLinhas,
  listLogs,
  processJobs,
  STATUS_CERTIFICACAO,
  type ProspeccaoLinha,
  type ProspeccaoLog,
  type StatusCertificacao,
} from "@/services/prospeccaoService";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Clock, CheckCircle2, AlertTriangle, RefreshCw, PlayCircle, Download, ScrollText } from "lucide-react";

// PARTE 5 — status possíveis da certificação
const certMeta: Record<string, { bg: string; fg: string }> = {
  "Em Processamento":   { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,38%)"  },
  "Concluído":          { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,28%)" },
  "Revisão Manual":     { bg: "hsl(217,91%,95%)", fg: "hsl(217,91%,40%)" },
  "Erro OCR":           { bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,40%)"   },
  "Documento Duplicado":{ bg: "hsl(270,60%,95%)", fg: "hsl(270,60%,40%)" },
  "Documento Inválido": { bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,35%)" },
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function mesLabel(l: ProspeccaoLinha) {
  const ref = l.mes_referencia || (l.data_distribuicao ? l.data_distribuicao.slice(0, 7) : null);
  if (!ref) return "—";
  const [y, m] = ref.split("-");
  return `${MESES[Number(m) - 1] || m}/${y}`;
}

// Modelo canônico → linha da planilha (mesma fonte para tabela, dashboards e Excel)
function toExportRow(l: ProspeccaoLinha) {
  const ws = l.ai_extracted?.workspace || {};
  return {
    "Data Distribuição": fmtDate(l.data_distribuicao),
    "Mês": mesLabel(l),
    "Processo": ws.processo || l.numero_processo || "",
    "Empresa": ws.empresa || l.parte_pro_nome || "",
    "Vara": ws.vara || l.orgao_tribunal || "",
    "Estado": ws.estado || l.uf || "",
    "Passivo": ws.valor_exportacao ?? l.valor_pleito ?? "",
    "AJ": ws.administrador_judicial || "",
    "Magistrado": ws.juiz || "",
    "Link Documento": l.link_documento || "",
    "Status": l.status_certificacao || "Em Processamento",
  };
}

export default function ConsultorRelatorios() {
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusCertificacao | "Todos">("Todos");
  const [linhas, setLinhas] = useState<ProspeccaoLinha[]>([]);
  const [logs, setLogs] = useState<ProspeccaoLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();
  const timer = useRef<number | null>(null);

  const load = async () => {
    try {
      const [l, lg] = await Promise.all([listLinhas(), listLogs(30).catch(() => [])]);
      setLinhas(l);
      setLogs(lg);
    } catch (e) {
      toast({ title: "Erro ao carregar", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Atualização automática da planilha enquanto houver documentos em processamento
  const emProcessamento = linhas.filter(l => (l.status_certificacao || "Em Processamento") === "Em Processamento").length;
  useEffect(() => {
    if (emProcessamento > 0) {
      timer.current = window.setTimeout(load, 10000);
    }
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [emProcessamento, linhas]);

  const onProcessar = async () => {
    setProcessing(true);
    try {
      const r = await processJobs(5);
      toast({ title: "Processamento iniciado", description: `${r.processed} documento(s) enviados ao motor de IA.` });
      await load();
    } catch (e) {
      toast({ title: "Erro no processamento", description: String((e as Error).message), variant: "destructive" });
    } finally { setProcessing(false); }
  };

  const filtered = linhas.filter(l => {
    if (statusFiltro !== "Todos" && (l.status_certificacao || "Em Processamento") !== statusFiltro) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const ws = l.ai_extracted?.workspace || {};
    return [l.numero_processo, ws.processo, l.parte_pro_nome, ws.empresa, ws.administrador_judicial, ws.juiz, l.uf]
      .some(v => v && String(v).toLowerCase().includes(q));
  });

  const concluidos = linhas.filter(l => l.status_certificacao === "Concluído").length;
  const revisao = linhas.filter(l => l.status_certificacao === "Revisão Manual").length;
  const erros = linhas.filter(l => l.status_certificacao === "Erro OCR" || l.status_certificacao === "Documento Inválido").length;

  const onExportar = () => {
    const rows = filtered.map(toExportRow);
    if (!rows.length) {
      toast({ title: "Nada para exportar", description: "Nenhuma linha na seleção atual." });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prospeccao AJ");
    XLSX.writeFile(wb, `prospeccao-aj-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <ConsultorPageShell
      title="Inteligência Executiva de Processos"
      subtitle="Ambiente de Inteligência Executiva fundamentado nas evidências produzidas pelo motor cognitivo."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total de Linhas",  value: linhas.length, hint: "Acumulado",  icon: FileSpreadsheet, tone: "blue"   },
        { label: "Em Processamento", value: emProcessamento, hint: "Automático", icon: Clock,         tone: "orange" },
        { label: "Concluídos",       value: concluidos,    hint: "Certificados", icon: CheckCircle2,  tone: "green"  },
        { label: "Revisão / Erro",   value: revisao + erros, hint: "Requer atenção", icon: AlertTriangle, tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Planilha carregada &amp; status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Campos certificados a partir do <b>JSON Canônico</b> gerado pela IA — toda análise é baseada exclusivamente em evidências extraídas dos documentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as StatusCertificacao | "Todos")}
              className="text-xs font-medium px-2 py-1.5 rounded border bg-white"
            >
              <option value="Todos">Todos os status</option>
              {STATUS_CERTIFICACAO.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setShowLogs(v => !v)} className="text-xs font-semibold px-3 py-1.5 rounded border hover:bg-muted flex items-center gap-1">
              <ScrollText className="w-3.5 h-3.5" /> Logs
            </button>
            <button onClick={onExportar} className="text-xs font-semibold px-3 py-1.5 rounded border hover:bg-muted flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
            <button onClick={load} className="text-xs font-semibold px-3 py-1.5 rounded border hover:bg-muted flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
            <button onClick={onProcessar} disabled={processing}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-[hsl(217,91%,50%)] text-white hover:bg-[hsl(217,91%,45%)] disabled:opacity-50 flex items-center gap-1">
              <PlayCircle className="w-3.5 h-3.5" /> {processing ? "Processando..." : "Processar PDFs"}
            </button>
          </div>
        </div>

        {showLogs && (
          <div className="border-b bg-muted/30 p-4">
            <h4 className="text-xs font-semibold mb-2">Logs de processamento</h4>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum log registrado.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {logs.map(g => (
                  <div key={g.id} className="text-[11px] flex flex-wrap gap-x-3 text-muted-foreground border-b border-border/50 pb-1">
                    <span className="font-mono">{new Date(g.created_at).toLocaleString("pt-BR")}</span>
                    <span>Modelo: {g.modelo_gemini || "—"}</span>
                    <span>{g.tempo_ms != null ? `${(g.tempo_ms / 1000).toFixed(1)}s` : "—"}</span>
                    <span className="font-semibold text-foreground">{g.resultado}</span>
                    <span className="truncate max-w-[280px]">{g.documento}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma linha. Envie uma planilha em <strong>Upload Planilha</strong>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[hsl(217,91%,50%)] text-white">
                <tr>
                  {[
                    "Data Distribuição", "Mês", "Processo", "Empresa", "Vara", "Estado",
                    "Passivo", "AJ", "Magistrado", "Doc.", "IA", "Status",
                  ].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const ws = r.ai_extracted?.workspace || {};
                  const st = r.status_certificacao || "Em Processamento";
                  const cm = certMeta[st] || certMeta["Em Processamento"];
                  const cert = r.certificacao || {};
                  const certTitle = Object.entries(cert).map(([k, v]) => `${v ? "✓" : "✗"} ${k.replace(/_/g, " ")}`).join("\n");
                  return (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <td className="px-3 py-2 border-b whitespace-nowrap">{fmtDate(r.data_distribuicao)}</td>
                      <td className="px-3 py-2 border-b whitespace-nowrap">{mesLabel(r)}</td>
                      <td className="px-3 py-2 border-b font-mono whitespace-nowrap">{ws.processo || r.numero_processo || "—"}</td>
                      <td className="px-3 py-2 border-b max-w-[220px] font-semibold"><span className="block truncate">{ws.empresa || r.parte_pro_nome || "—"}</span></td>
                      <td className="px-3 py-2 border-b max-w-[200px]"><span className="block truncate">{ws.vara || r.orgao_tribunal || "—"}</span></td>
                      <td className="px-3 py-2 border-b">{ws.estado || r.uf || "—"}</td>
                      <td className="px-3 py-2 border-b whitespace-nowrap font-bold text-blue-700" title={ws.natureza_valor || ""}>
                        {fmtMoney(ws.valor_exportacao ?? r.valor_pleito)}
                      </td>
                      <td className="px-3 py-2 border-b max-w-[180px]"><span className="block truncate">{ws.administrador_judicial || "—"}</span></td>
                      <td className="px-3 py-2 border-b max-w-[180px]"><span className="block truncate">{ws.juiz || "—"}</span></td>
                      <td className="px-3 py-2 border-b text-center">
                        {r.link_documento ? (
                          <a href={r.link_documento} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">PDF</a>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 border-b text-center">
                        <InteligenciaExecutivaPanel linha={r} />
                      </td>
                      <td className="px-3 py-2 border-b">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                          style={{ background: cm.bg, color: cm.fg }}
                          title={certTitle || r.ai_error || undefined}
                        >
                          {st}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ConsultorPageShell>
  );
}
