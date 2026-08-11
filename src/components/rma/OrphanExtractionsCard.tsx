import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrphanCardProps {
  companyId: string;
  prospecçãoId?: string | null;
  onConsolidated?: () => void;
}

interface OrphansResponse {
  orphans: Array<{ extraction_id: string; document_id: string; file_name: string; classe: string; period_key: string }>;
  byPeriod: Record<string, { count: number; files: string[] }>;
  prospecçãoId: string | null;
}

const OrphanExtractionsCard = ({ companyId, prospecçãoId, onConsolidated }: OrphanCardProps) => {
  const [data, setData] = useState<OrphansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectRef}.supabase.co/functions/v1/balancete-build?action=orphans&company_id=${encodeURIComponent(companyId)}${prospecçãoId ? `&prospecção_id=${encodeURIComponent(prospecçãoId)}` : ""}`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const j = await res.json();
      if (res.ok) setData(j);
      else throw new Error(j.error || "Falha ao listar extrações órfãs");
    } catch (e: any) {
      console.error("[OrphanExtractionsCard]", e);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, prospecçãoId]);

  useEffect(() => { load(); }, [load]);

  const consolidar = async () => {
    setRunning(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("balancete-build", {
        body: { company_id: companyId, prospecção_id: prospecçãoId, auto_period: true, action: "backfill", force: true },
      });
      if (error) throw error;
      const periodos = resp?.periods_detected ?? 0;
      const indef = resp?.undefined_count ?? 0;
      toast.success(`Consolidação iniciada para ${periodos} período(s).` + (indef ? ` ${indef} arquivo(s) sem período identificável foram ignorados.` : ""));
      // Recarrega depois de alguns segundos
      setTimeout(() => { load(); onConsolidated?.(); }, 4000);
    } catch (e: any) {
      console.error("[consolidar backfill]", e);
      toast.error(e.message || "Falha ao consolidar");
    } finally {
      setRunning(false);
    }
  };

  if (!data || data.orphans.length === 0) return null;

  const periodos = Object.entries(data.byPeriod).filter(([k]) => k !== "indefinido");
  const indef = data.byPeriod["indefinido"]?.count ?? 0;

  return (
    <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
      <CardContent className="py-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {data.orphans.length} extração(ões) IA não consolidada(s) no balancete
              </div>
              <div className="text-xs text-amber-800/90 dark:text-amber-200/80">
                A IA já leu esses documentos, mas eles não foram consolidados ainda — provavelmente porque o período do arquivo difere do mês selecionado. Use o botão abaixo para consolidar automaticamente no período correto detectado pelo nome do arquivo.
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {periodos.map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="text-[11px]">
                    {k}: <span className="font-semibold ml-1">{v.count}</span>
                  </Badge>
                ))}
                {indef > 0 && (
                  <Badge variant="outline" className="text-[11px] border-amber-400 text-amber-700">
                    Sem período identificável: {indef}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              onClick={consolidar}
              disabled={running || periodos.length === 0}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {running ? "Consolidando..." : `Consolidar ${periodos.length} período(s) agora`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrphanExtractionsCard;
