// Card de upload real para o fluxo Prospecção AJ.
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile, processJobs, countByStatus } from "@/services/prospeccaoService";
import { Link } from "react-router-dom";

interface Item { name: string; status: "enviando" | "ok" | "erro"; rows?: number; error?: string; }

export default function ProspeccaoUploadCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState({ total: 0, pendentes: 0, extraidos: 0, erros: 0 });
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const refresh = async () => {
    try { setStats(await countByStatus()); } catch { /* ignore */ }
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
            <Kpi label="Extraídos" value={stats.extraidos} tone="green" />
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
              <PlayCircle className="w-3.5 h-3.5" /> {processing ? "Processando..." : "Processar PDFs pendentes"}
            </button>
          </div>
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
