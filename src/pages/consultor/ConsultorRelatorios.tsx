import { useEffect, useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { listLinhas, countByStatus, processJobs, type ProspeccaoLinha } from "@/services/prospeccaoService";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Clock, CheckCircle2, AlertTriangle, RefreshCw, PlayCircle } from "lucide-react";

const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  pendente: { label: "Pendente", bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" },
  baixado:  { label: "Baixado",  bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  extraido: { label: "Validado", bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  erro:     { label: "Erro",     bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,40%)"   },
  sem_link: { label: "Sem link", bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" },
};

// Rótulo exibido na coluna "Link Documento" — indica se o PDF foi carregado
// (baixado ou extraído com sucesso) ou se houve falha ao obtê-lo.
function pdfBadge(ai_status: string, link: string | null) {
  if (!link) return { label: "Sem link", bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" };
  if (ai_status === "erro") return { label: "Falha PDF", bg: "hsl(0,84%,95%)", fg: "hsl(0,84%,40%)" };
  if (ai_status === "baixado" || ai_status === "extraido") return { label: "PDF Carregado", bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" };
  return { label: "Aguardando", bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)" };
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export default function ConsultorRelatorios() {
  const [search, setSearch] = useState("");
  const [linhas, setLinhas] = useState<ProspeccaoLinha[]>([]);
  const [stats, setStats] = useState({ total: 0, pendentes: 0, extraidos: 0, erros: 0 });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([listLinhas(), countByStatus()]);
      setLinhas(l); setStats(s);
    } catch (e) {
      toast({ title: "Erro ao carregar", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onProcessar = async () => {
    setProcessing(true);
    try {
      const r = await processJobs(5);
      toast({ title: "Processamento iniciado", description: `${r.processed} job(s) processados.` });
      await load();
    } catch (e) {
      toast({ title: "Erro no processamento", description: String((e as Error).message), variant: "destructive" });
    } finally { setProcessing(false); }
  };

  const filtered = linhas.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [l.numero_processo, l.parte_con_nome, l.parte_pro_nome, l.municipio, l.uf]
      .some(v => v && v.toLowerCase().includes(q));
  });

  return (
    <ConsultorPageShell
      title="Planilha"
      subtitle="Linhas carregadas a partir dos uploads e enriquecidas pela IA com dados extraídos dos PDFs."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total de Linhas", value: stats.total,     hint: "Acumulado", icon: FileSpreadsheet, tone: "blue"   },
        { label: "PDFs Pendentes",  value: stats.pendentes, hint: "A processar", icon: Clock,        tone: "orange" },
        { label: "Linhas Validadas",  value: stats.extraidos, hint: "Concluídos", icon: CheckCircle2, tone: "green"  },
        { label: "Erros",           value: stats.erros,     hint: "Revisar",    icon: AlertTriangle, tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Planilha carregada & status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dados extraídos automaticamente dos PDFs vinculados na coluna Link_Documento.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="text-xs font-semibold px-3 py-1.5 rounded border hover:bg-muted flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
            <button onClick={onProcessar} disabled={processing || stats.pendentes === 0}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-[hsl(217,91%,50%)] text-white hover:bg-[hsl(217,91%,45%)] disabled:opacity-50 flex items-center gap-1">
              <PlayCircle className="w-3.5 h-3.5" /> {processing ? "Processando..." : "Processar PDFs"}
            </button>
          </div>
        </div>

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
                    "Status IA","Classificação","Evidência","Nº Processo",
                    "Parte PRO - Nome","CNPJ","Tipo de Ação",
                    "Valor da Causa / Passivo", "Magistrado / AJ",
                    "Órgão/Tribunal","UF","Município",
                    "Link Documento",
                  ].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sm = statusMeta[r.ai_status] || statusMeta.pendente;
                  const pb = pdfBadge(r.ai_status, r.link_documento);
                  return (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <td className="px-3 py-2 border-b">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: sm.bg, color: sm.fg }}>{sm.label}</span>
                      </td>
                      <td className="px-3 py-2 border-b">
                        {r.ai_extracted?.classificacao ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {r.ai_extracted.classificacao.tipo_documento}
                            </span>
                            <span className="text-[9px] text-muted-foreground italic">
                              {r.ai_extracted.classificacao.fase_processual}
                            </span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 border-b">
                        {r.ai_extracted?.evidencia ? (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title={r.ai_extracted.evidencia.trecho_chave}>
                            Pág {r.ai_extracted.evidencia.pagina || r.ai_extracted.evidencia.pagina_inicio} ({r.ai_extracted.evidencia.confianca || r.ai_extracted.classificacao?.nivel_confianca || 0}%)
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 border-b font-mono whitespace-nowrap">{r.numero_processo || "—"}</td>
                      <td className="px-3 py-2 border-b max-w-[220px] font-semibold"><span className="block truncate">{r.parte_pro_nome || "—"}</span></td>
                      <td className="px-3 py-2 border-b font-mono">{r.parte_pro_cnpj || r.ai_extracted?.dados?.parte_pro_cnpj || "—"}</td>
                      <td className="px-3 py-2 border-b">{r.acao_judicial || r.ai_extracted?.classificacao?.tipo_processo || "—"}</td>
                      <td className="px-3 py-2 border-b whitespace-nowrap font-medium">{fmtMoney(r.valor_pleito)}</td>
                      <td className="px-3 py-2 border-b max-w-[200px]">
                        <span className="block truncate" title={r.pedidos_principais}>
                          {r.pedidos_principais || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b max-w-[240px]"><span className="block truncate">{r.orgao_tribunal || "—"}</span></td>
                      <td className="px-3 py-2 border-b">{r.uf || "—"}</td>
                      <td className="px-3 py-2 border-b">{r.municipio || "—"}</td>
                      <td className="px-3 py-2 border-b">
                        {r.link_documento ? (
                          <a
                            href={r.link_documento}
                            target="_blank"
                            rel="noreferrer"
                            title={r.ai_error || r.link_documento}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
                            style={{ background: pb.bg, color: pb.fg }}
                          >
                            {pb.label}
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: pb.bg, color: pb.fg }}>{pb.label}</span>
                        )}
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
