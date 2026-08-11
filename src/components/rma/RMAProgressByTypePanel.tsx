import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileText, FileCheck, Lock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { getRmaDocRules, type RmaDocTipo } from "@/lib/prospecçãoDocumentRules";

interface DocSummary {
  tipo: RmaDocTipo;
  exists: boolean;
  status: string | null;
  total: number;
  pendentes: number;
  emEdicao: number;
  revisadas: number;
  aprovadas: number;
  concluidas: number;
  finalUrl: string | null;
  finalVersao: number | null;
  finalGeradoEm: string | null;
}

const TIPOS: Array<{ tipo: RmaDocTipo; icon: typeof FileText; accent: string }> = [
  { tipo: "parecer_tecnico", icon: FileText, accent: "hsl(330,70%,50%)" },
  { tipo: "prospecção_mensal",      icon: FileCheck, accent: "hsl(280,60%,50%)" },
];

function pctColor(pct: number) {
  if (pct < 33) return "hsl(0,84%,60%)";
  if (pct < 67) return "hsl(38,92%,50%)";
  return "hsl(142,76%,36%)";
}

function etapaAtual(s: DocSummary, minAuto: number, minManual: number) {
  if (!s.exists) return { label: "Não iniciado", icon: AlertCircle, color: "hsl(0,0%,55%)" };
  const aprovPct = s.total ? Math.round(((s.aprovadas + s.concluidas) * 100) / s.total) : 0;
  if (s.status === "finalizado") return { label: "Finalizado", icon: Lock, color: "hsl(142,76%,36%)" };
  if (aprovPct >= minAuto)       return { label: "Pronto p/ emissão final", icon: CheckCircle2, color: "hsl(142,76%,36%)" };
  if (aprovPct >= minManual)     return { label: "Pronto p/ emissão manual", icon: CheckCircle2, color: "hsl(217,91%,50%)" };
  if (s.revisadas > 0)           return { label: "Em revisão pelo Coordenador", icon: Loader2, color: "hsl(38,92%,50%)" };
  if (s.emEdicao > 0)            return { label: "Em edição (consultor)", icon: Loader2, color: "hsl(38,92%,50%)" };
  if (s.pendentes === s.total)   return { label: "Aguardando geração IA", icon: AlertCircle, color: "hsl(0,84%,60%)" };
  return { label: "Em produção", icon: Loader2, color: "hsl(217,91%,50%)" };
}

const ProspecçãoProgressByTypePanel = () => {
  const { id = "" } = useParams();
  const [summaries, setSummaries] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const result: DocSummary[] = [];
      for (const { tipo } of TIPOS) {
        const { data: doc } = await supabase
          .from("prospecção_documents")
          .select("id, status, arquivo_final_url, arquivo_final_versao, arquivo_final_gerado_em")
          .eq("prospecção_id", id)
          .eq("tipo", tipo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let summary: DocSummary = {
          tipo, exists: !!doc, status: doc?.status ?? null,
          total: 0, pendentes: 0, emEdicao: 0, revisadas: 0, aprovadas: 0, concluidas: 0,
          finalUrl: doc?.arquivo_final_url ?? null,
          finalVersao: doc?.arquivo_final_versao ?? null,
          finalGeradoEm: doc?.arquivo_final_gerado_em ?? null,
        };

        if (doc?.id) {
          const { data: secs } = await supabase
            .from("prospecção_document_sections")
            .select("status")
            .eq("document_id", doc.id);
          (secs || []).forEach((s: any) => {
            summary.total++;
            switch (s.status) {
              case "pendente":   summary.pendentes++; break;
              case "em_edicao":  summary.emEdicao++; break;
              case "revisado":   summary.revisadas++; break;
              case "aprovado":   summary.aprovadas++; break;
              case "concluido":  summary.concluidas++; break;
            }
          });
        }
        result.push(summary);
      }
      if (!cancel) {
        setSummaries(result);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  if (loading) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando progresso dos documentos…</CardContent></Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {summaries.map((s) => {
        const cfg = TIPOS.find((t) => t.tipo === s.tipo)!;
        const rules = getRmaDocRules(s.tipo);
        const Icon = cfg.icon;
        const aprovPct = s.total ? Math.round(((s.aprovadas + s.concluidas) * 100) / s.total) : 0;
        const concluPct = s.total ? Math.round((s.concluidas * 100) / s.total) : 0;
        const etapa = etapaAtual(s, rules.minPctAutoFinal, rules.minPctManualFinal);
        const EtapaIcon = etapa.icon;

        return (
          <Card key={s.tipo} className="border-l-4" style={{ borderLeftColor: cfg.accent }}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: cfg.accent }} />
                  {rules.label}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] gap-1" style={{ color: etapa.color, borderColor: etapa.color }}>
                  <EtapaIcon className={`w-3 h-3 ${etapa.icon === Loader2 ? "animate-spin" : ""}`} />
                  {etapa.label}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{rules.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Aprovação ({s.aprovadas + s.concluidas}/{s.total})</span>
                  <span className="font-semibold" style={{ color: pctColor(aprovPct) }}>{aprovPct}%</span>
                </div>
                <Progress value={aprovPct} className="h-2" style={{ ["--progress-color" as any]: pctColor(aprovPct) }} />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Conclusão final ({s.concluidas}/{s.total})</span>
                  <span className="font-semibold" style={{ color: pctColor(concluPct) }}>{concluPct}%</span>
                </div>
                <Progress value={concluPct} className="h-1.5" />
              </div>

              <div className="grid grid-cols-5 gap-2 text-center pt-1">
                <Stat label="Pendentes"  value={s.pendentes}  color="hsl(0,0%,55%)" />
                <Stat label="Em edição"  value={s.emEdicao}   color="hsl(38,92%,50%)" />
                <Stat label="Revisão"    value={s.revisadas}  color="hsl(217,91%,50%)" />
                <Stat label="Aprovadas"  value={s.aprovadas}  color="hsl(142,76%,36%)" />
                <Stat label="Concluídas" value={s.concluidas} color="hsl(142,76%,30%)" />
              </div>

              <div className="text-[11px] text-muted-foreground border-t pt-2 space-y-0.5">
                <div>Mínimo p/ emissão manual: <b>{rules.minPctManualFinal}%</b> · automática: <b>{rules.minPctAutoFinal}%</b></div>
                {s.finalUrl ? (
                  <div>
                    {rules.finalLabel} v{s.finalVersao} gerado em {s.finalGeradoEm ? new Date(s.finalGeradoEm).toLocaleString("pt-BR") : "—"} ·{" "}
                    <a href={s.finalUrl} target="_blank" rel="noreferrer" className="text-[hsl(217,91%,50%)] underline">baixar .docx</a>
                  </div>
                ) : (
                  <div className="italic">{rules.finalLabel} ainda não emitido.</div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div>
    <div className="text-base font-bold" style={{ color }}>{value}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
  </div>
);

export default ProspecçãoProgressByTypePanel;
