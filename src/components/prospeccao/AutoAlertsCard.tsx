// Fase 7 — Card resumido de alertas financeiros (regra + IA).
// Exibido no topo das abas Balancete, BS e P&L.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase-any";

interface AlertRow {
  id?: string;
  severidade: "info" | "ok" | "warn" | "bad";
  origem: "rule" | "ai";
  categoria: string;
  titulo: string;
  mensagem: string;
  recomendacao?: string | null;
  periodo_ref?: string | null;
}

interface Props {
  companyId: string | null;
  runToken?: string | number;
  className?: string;
}

const sevStyle = {
  bad: "border-rose-500/40 bg-rose-50/50 text-rose-900",
  warn: "border-amber-500/40 bg-amber-50/50 text-amber-900",
  ok: "border-emerald-500/40 bg-emerald-50/50 text-emerald-900",
  info: "border-sky-500/40 bg-sky-50/50 text-sky-900",
};
const sevIcon = { bad: AlertTriangle, warn: AlertTriangle, ok: CheckCircle2, info: Info };

export default function AutoAlertsCard({ companyId, runToken, className }: Props) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("financial_alerts")
      .select("id, severidade, origem, categoria, titulo, mensagem, recomendacao, periodo_ref")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setAlerts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId, runToken]);

  const generate = async () => {
    if (!companyId) return;
    setGenerating(true);
    try {
      await supabase.functions.invoke("financial-alerts", { body: { company_id: companyId } });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const visible = expanded ? alerts : alerts.slice(0, 3);
  const hasAi = alerts.some(a => a.origem === "ai");

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[hsl(258,90%,56%)]" />
            Alertas e Insights Automáticos
            {hasAi && <Badge variant="secondary" className="text-[10px]">IA</Badge>}
            {alerts.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{alerts.length}</Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={generate} disabled={generating || !companyId}>
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Gerar com IA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> Carregando…
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            Nenhum alerta gerado. Clique em <b>Gerar com IA</b> para analisar os últimos 6 meses.
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.map((a, i) => {
              const Icon = sevIcon[a.severidade];
              return (
                <div key={a.id || i} className={`rounded-md border px-2.5 py-1.5 text-xs ${sevStyle[a.severidade]}`}>
                  <div className="flex items-start gap-1.5">
                    <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold">{a.titulo}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {a.origem === "ai" ? "IA" : "Regra"}
                        </Badge>
                        {a.periodo_ref && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">{a.periodo_ref}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 leading-snug">{a.mensagem}</p>
                      {a.recomendacao && (
                        <p className="mt-1 text-[10px] opacity-80"><b>Ação:</b> {a.recomendacao}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {alerts.length > 3 && (
              <Button variant="ghost" size="sm" className="w-full h-6 text-[11px]"
                onClick={() => setExpanded(v => !v)}>
                {expanded ? "Mostrar menos" : `Mostrar mais (${alerts.length - 3})`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
