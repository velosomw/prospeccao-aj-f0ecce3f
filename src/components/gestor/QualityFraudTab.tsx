import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldAlert, TrendingUp, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getQualityMetrics,
  listFraudAlerts,
  updateAlertStatus,
  type QualityMetrics,
  type FraudAlert,
} from "@/services/qualityFraudService";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function severityBadge(s: FraudAlert["severity"]) {
  const map = {
    high: "bg-red-500/15 text-red-700 border-red-500/30",
    medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    low: "bg-muted text-muted-foreground",
  };
  return map[s];
}

function alertTypeLabel(t: FraudAlert["alert_type"]) {
  return { duplicate: "Duplicidade", outlier: "Valor atípico", inconsistency: "Inconsistência" }[t];
}

function qualityColor(score: number) {
  if (score >= 0.85) return "text-emerald-600";
  if (score >= 0.7) return "text-amber-600";
  return "text-red-600";
}

export default function QualityFraudTab() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FraudAlert["status"] | "all">("open");

  async function load() {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([
        getQualityMetrics(),
        listFraudAlerts({ status: filter === "all" ? undefined : filter, limit: 50 }),
      ]);
      setMetrics(m);
      setAlerts(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar métricas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function handleAction(id: string, status: FraudAlert["status"]) {
    try {
      await updateAlertStatus(id, status);
      toast.success("Alerta atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Motor de Qualidade & Antifraude</h3>
          <p className="text-sm text-muted-foreground">
            Score global por extração e alertas automáticos de duplicidade, outliers e inconsistências.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Qualidade média
          </div>
          <div className={`text-2xl font-bold mt-1 ${qualityColor(metrics?.avg_quality ?? 0)}`}>
            {metrics ? fmtPct(metrics.avg_quality) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{metrics?.total ?? 0} extrações</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pendentes de revisão</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {metrics?.pending_review ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">score &lt; 0.5</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Reprocessadas auto</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {metrics?.reprocessed ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">score 0.5 – 0.7</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Alertas abertos
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {alerts.filter((a) => a.status === "open").length}
          </div>
        </Card>
      </div>

      {/* Composição do score */}
      {metrics && metrics.total > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Composição do score (média)</div>
          <div className="grid grid-cols-3 gap-4">
            <ScoreBar label="OCR" pct={metrics.avg_ocr} weight="30%" />
            <ScoreBar label="Agente IA" pct={metrics.avg_ai} weight="50%" />
            <ScoreBar label="Validador" pct={metrics.avg_validation} weight="20%" />
          </div>
          {metrics.by_classe.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs text-muted-foreground mb-2">Qualidade por classe</div>
              <div className="flex flex-wrap gap-2">
                {metrics.by_classe.map((c) => (
                  <Badge key={c.classe} variant="outline" className="gap-1.5">
                    {c.classe}
                    <span className={qualityColor(c.avg_quality)}>{fmtPct(c.avg_quality)}</span>
                    <span className="text-muted-foreground">· {c.count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Alertas */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            Alertas antifraude
          </div>
          <div className="flex gap-1">
            {(["open", "acknowledged", "resolved", "all"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filter === s ? "default" : "outline"}
                onClick={() => setFilter(s)}
                className="text-xs h-7"
              >
                {s === "open" ? "Abertos" : s === "acknowledged" ? "Reconhecidos" : s === "resolved" ? "Resolvidos" : "Todos"}
              </Button>
            ))}
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum alerta {filter !== "all" ? `com status "${filter}"` : ""}.
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-2 pr-2">
              {alerts.map((a) => (
                <div key={a.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-xs ${severityBadge(a.severity)}`}>
                          {alertTypeLabel(a.alert_type)}
                        </Badge>
                        {a.classe && <Badge variant="outline" className="text-xs">{a.classe}</Badge>}
                        {a.prospeccao_id && (
                          <span className="text-xs text-muted-foreground">Prospeccao: {a.prospeccao_id}</span>
                        )}
                      </div>
                      <p className="text-sm">{a.message}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    {a.status === "open" && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(a.id, "resolved")}
                          className="h-7 gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction(a.id, "false_positive")}
                          className="h-7 gap-1 text-muted-foreground"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Falso positivo
                        </Button>
                      </div>
                    )}
                    {a.status !== "open" && (
                      <Badge variant="secondary" className="text-xs">{a.status}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}

function ScoreBar({ label, pct, weight }: { label: string; pct: number; weight: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">peso {weight}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${pct >= 0.85 ? "bg-emerald-500" : pct >= 0.7 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${Math.max(2, pct * 100)}%` }}
        />
      </div>
      <div className={`text-sm font-semibold mt-1 ${qualityColor(pct)}`}>{fmtPct(pct)}</div>
    </div>
  );
}
