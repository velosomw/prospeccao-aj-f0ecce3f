import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import type { Insight } from "@/services/bsDados/auditChartsOptions";

const InsightsCard = ({ insights }: { insights: Insight[] }) => {
  if (!insights.length) return null;
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Insights automáticos
        </div>
        <div className="space-y-1.5">
          {insights.map((i, idx) => {
            const map = {
              ok: { Icon: CheckCircle2, bg: "bg-emerald-500/10", text: "text-emerald-700", border: "border-emerald-500/30" },
              atencao: { Icon: AlertTriangle, bg: "bg-amber-500/10", text: "text-amber-700", border: "border-amber-500/30" },
              critico: { Icon: AlertOctagon, bg: "bg-red-500/10", text: "text-red-700", border: "border-red-500/30" },
            }[i.tipo];
            const Icon = map.Icon;
            return (
              <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-md border ${map.bg} ${map.border}`}>
                <Icon className={`w-4 h-4 ${map.text}`} />
                <span className={`text-sm ${map.text}`}>{i.texto}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default InsightsCard;
