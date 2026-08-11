import { useMemo, useState } from "react";
import {
  FileWarning, Download, Loader2, CheckCircle2, AlertOctagon,
  AlertTriangle, Sparkles, ShieldCheck, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  buildPendenciasFromAnalysis,
  generateOficioDocx,
  generateOficioPdf,
  type OficioMeta,
} from "@/lib/oficioPendencias";

interface Props {
  analysis: any;
  prospecçãoCode: string;
  mesReferencia?: string;
  empresa?: string;
  responsavel?: string;
}

export default function OficioPendenciasCard({
  analysis, prospecçãoCode, mesReferencia, empresa, responsavel,
}: Props) {
  const pendencias = useMemo(() => buildPendenciasFromAnalysis(analysis), [analysis]);
  const [busy, setBusy] = useState<null | "pdf" | "docx">(null);
  const [showPreview, setShowPreview] = useState(false);

  const criticas = pendencias.filter((p) => p.severidade === "critica").length;
  const altas = pendencias.filter((p) => p.severidade === "alta").length;
  const medias = pendencias.filter((p) => p.severidade === "media").length;
  const baixas = pendencias.filter((p) => p.severidade === "baixa").length;
  const total = pendencias.length;

  const meta: OficioMeta = { prospecçãoCode, mesReferencia, empresa, responsavel };

  const handle = async (fmt: "pdf" | "docx") => {
    setBusy(fmt);
    try {
      if (fmt === "docx") await generateOficioDocx(pendencias, meta);
      else generateOficioPdf(pendencias, meta);
      toast({
        title: "Ofício gerado",
        description: `${total} pendências · formato ${fmt.toUpperCase()}`,
      });
    } catch (e: any) {
      toast({ title: "Falha ao gerar ofício", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const semPendencias = total === 0;

  return (
    <div className="bg-white border border-border rounded-lg p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg text-white flex items-center justify-center ${
              semPendencias ? "bg-emerald-600" : "bg-amber-500"
            }`}
          >
            {semPendencias ? <ShieldCheck className="h-5 w-5" /> : <FileWarning className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Ofício de Pendências</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Documento foprospecçãol endereçado à Recuperanda consolidando pendências, inconsistências e
              documentos faltantes identificados pela análise IA. Pode ser emitido a qualquer
              momento e regenerado conforme novas evidências são incorporadas.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap items-center">
              {semPendencias ? (
                <Badge className="bg-emerald-600 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Sem pendências identificadas
                </Badge>
              ) : (
                <>
                  <Badge className="bg-amber-500 text-white">{total} pendências</Badge>
                  {criticas > 0 && (
                    <Badge className="bg-rose-600 text-white gap-1">
                      <AlertOctagon className="h-3 w-3" /> {criticas} críticas
                    </Badge>
                  )}
                  {altas > 0 && (
                    <Badge className="bg-orange-500 text-white gap-1">
                      <AlertTriangle className="h-3 w-3" /> {altas} altas
                    </Badge>
                  )}
                  {medias > 0 && <Badge variant="outline">{medias} médias</Badge>}
                  {baixas > 0 && <Badge variant="outline">{baixas} baixas</Badge>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handle("pdf")}
            disabled={!!busy}
            className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
          >
            {busy === "pdf" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : semPendencias ? (
              <Sparkles className="h-4 w-4 mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Gerar PDF
          </Button>
          <Button variant="outline" onClick={() => handle("docx")} disabled={!!busy}>
            {busy === "docx" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Gerar DOCX
          </Button>
        </div>
      </div>

      {semPendencias ? (
        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Nenhuma pendência identificada nesta data.</strong> Você pode emitir um ofício
            informativo (atestando ausência de pendências) ou aguardar nova incorporação de dados.
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="w-full bg-muted/40 hover:bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-2"
            aria-expanded={showPreview}
          >
            <span className="flex items-center gap-2">
              {showPreview ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Prévia · primeiras {Math.min(5, pendencias.length)} de {pendencias.length}
            </span>
            <span className="text-[10px] noprospecçãol-case font-noprospecçãol text-muted-foreground/80">
              {showPreview ? "Ocultar" : "Mostrar"}
            </span>
          </button>
          {showPreview && (
            <div className="divide-y divide-border">
              {pendencias.slice(0, 5).map((p) => (
                <div key={p.numero} className="px-4 py-2 flex items-start gap-3 text-sm">
                  <span className="text-muted-foreground font-mono w-6">{p.numero}.</span>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">{p.topico}</div>
                    <div className="text-muted-foreground text-xs line-clamp-2">{p.descricao}</div>
                  </div>
                  <Badge
                    className={
                      p.severidade === "critica" ? "bg-rose-600 text-white" :
                      p.severidade === "alta" ? "bg-orange-500 text-white" :
                      p.severidade === "media" ? "bg-amber-400 text-amber-950" :
                      "bg-blue-100 text-blue-900"
                    }
                  >
                    {p.severidade}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!semPendencias && (
        <p className="mt-3 text-xs text-muted-foreground">
          Você pode gerar o <strong>Prospeccao AJ Final</strong> mesmo com pendências em aberto — elas
          serão automaticamente reportadas na seção final do relatório.
        </p>
      )}
    </div>
  );
}
