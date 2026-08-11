// Card de upload real para o fluxo Prospeccao AJ.
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile, processJobs, countByStatus, listLinhas, type ProspeccaoLinha } from "@/services/prospeccaoService";
import { Link } from "react-router-dom";

interface Item { name: string; status: "enviando" | "ok" | "erro"; rows?: number; error?: string; }

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

export default function ProspeccaoUploadCard({ companyId, onComplete }: { companyId?: string; onComplete?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState({ total: 0, pendentes: 0, extraidos: 0, erros: 0 });
  const [linhas, setLinhas] = useState<ProspeccaoLinha[]>([]);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const refresh = async () => {
    try {
      const [s, l] = await Promise.all([countByStatus(), listLinhas()]);
      setStats(s); setLinhas(l);
    } catch { /* ignore */ }
  };
  useEffect(() => { refresh(); }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const item: Item = { name: file.name, status: "enviando" };
      setItems(prev => [item, ...prev]);
      try {
        const r = await uploadFile(file);
        setItems(prev => prev.map(i => i === item ? { ...i, status: "ok", rows: r.rows } : i));
        if (onComplete) onComplete();
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        setItems(prev => prev.map(i => i === item ? { ...i, status: "erro", error: msg } : i));
        toast({ title: `Falha ao enviar ${file.name}`, description: msg, variant: "destructive" });
      }
    }
    await refresh();
  };

  const onProcess = async () => {
    setProcessing(true);
    try {
      const r = await processJobs(5);
      toast({ title: "PDFs processados", description: `${r.processed} job(s) finalizados.` });
      await refresh();
    } catch (e) {
      toast({ title: "Erro", description: String((e as Error).message), variant: "destructive" });
    } finally { setProcessing(false); }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Upload de Planilha ou PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/30 transition"
          >
            <Upload className="w-8 h-8 text-muted-foreground" />
            <div className="text-sm font-semibold">Clique ou arraste arquivos aqui</div>
            <div className="text-xs text-muted-foreground">XLSX, CSV ou PDF — até 20 MB</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.csv,.pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-muted/40">
                  {it.status === "enviando" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {it.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                  {it.status === "erro" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  <span className="font-mono truncate flex-1">{it.name}</span>
                  {it.status === "ok" && <span className="text-muted-foreground">{it.rows} linha(s)</span>}
                  {it.status === "erro" && <span className="text-red-600 truncate max-w-[300px]">{it.error}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Status do processamento da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 text-center">
            <Kpi label="Linhas" value={stats.total} />
            <Kpi label="Pendentes" value={stats.pendentes} tone="orange" />
            <Kpi label="Validado" value={stats.extraidos} tone="green" />
            <Kpi label="Erros" value={stats.erros} tone="red" />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Link to="/consultor/relatorios" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Ver planilha consolidada
            </Link>
            <button
              onClick={onProcess}
              disabled={processing || stats.pendentes === 0}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-[hsl(217,91%,50%)] text-white hover:bg-[hsl(217,91%,45%)] disabled:opacity-50 flex items-center gap-1"
            >
              <PlayCircle className="w-3.5 h-3.5" /> {processing ? "Processando..." : "Processar PDFs"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Planilha carregada ({linhas.length} linha{linhas.length === 1 ? "" : "s"})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {linhas.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma linha carregada ainda. Envie um arquivo XLSX/CSV acima.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[hsl(217,91%,50%)] text-white sticky top-0">
                  <tr>
                    {[
                      "ID Serviço","Nº Processo",
                      "Parte CON - Nome","Parte CON - CPF/CNPJ","Parte CON - Qualif.",
                      "Parte PRO - Nome","Parte PRO - CPF/CNPJ",
                      "Denominação","Órgão/Tribunal","Esfera","Instância","UF","Município",
                      "Área Judicial","Assunto Judicial","Ação Judicial",
                      "Valor Pleito","Status do Processo","Dt. Início","Dt. Cad. Causa",
                      "Processo Eletrônico?","Link Documento",
                    ].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r, i) => {
                    const pb = pdfBadge(r.ai_status, r.link_documento);
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <td className="px-2 py-1.5 border-b font-mono">{r.id_servico || "—"}</td>
                        <td className="px-2 py-1.5 border-b font-mono whitespace-nowrap">{r.numero_processo || "—"}</td>
                        <td className="px-2 py-1.5 border-b max-w-[200px]"><span className="block truncate">{r.parte_con_nome || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b font-mono">{r.parte_con_cnpj || "—"}</td>
                        <td className="px-2 py-1.5 border-b">{r.parte_con_qualif || "—"}</td>
                        <td className="px-2 py-1.5 border-b max-w-[200px]"><span className="block truncate">{r.parte_pro_nome || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b font-mono">{r.parte_pro_cnpj || "—"}</td>
                        <td className="px-2 py-1.5 border-b max-w-[180px]"><span className="block truncate">{r.denominacao || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b max-w-[220px]"><span className="block truncate">{r.orgao_tribunal || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b">{r.esfera || "—"}</td>
                        <td className="px-2 py-1.5 border-b">{r.instancia || "—"}</td>
                        <td className="px-2 py-1.5 border-b">{r.uf || "—"}</td>
                        <td className="px-2 py-1.5 border-b">{r.municipio || "—"}</td>
                        <td className="px-2 py-1.5 border-b">{r.area_judicial || "—"}</td>
                        <td className="px-2 py-1.5 border-b max-w-[220px]"><span className="block truncate">{r.assunto_judicial || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b max-w-[220px]"><span className="block truncate">{r.acao_judicial || "—"}</span></td>
                        <td className="px-2 py-1.5 border-b whitespace-nowrap">{fmtMoney(r.valor_pleito)}</td>
                        <td className="px-2 py-1.5 border-b">{r.status_processo || "—"}</td>
                        <td className="px-2 py-1.5 border-b whitespace-nowrap">{fmtDate(r.dt_inicio)}</td>
                        <td className="px-2 py-1.5 border-b whitespace-nowrap">{fmtDate(r.dt_cad_causa)}</td>
                        <td className="px-2 py-1.5 border-b">{r.processo_eletronico == null ? "—" : r.processo_eletronico ? "SIM" : "NÃO"}</td>
                        <td className="px-2 py-1.5 border-b">
                          {r.link_documento ? (
                            <a href={r.link_documento} target="_blank" rel="noreferrer" title={r.ai_error || r.link_documento}
                               className="px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
                               style={{ background: pb.bg, color: pb.fg }}>
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
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "orange" | "green" | "red" }) {
  const colors: Record<string, string> = {
    blue: "text-[hsl(217,91%,50%)]",
    orange: "text-orange-600",
    green: "text-green-600",
    red: "text-red-600",
  };
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-2xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
