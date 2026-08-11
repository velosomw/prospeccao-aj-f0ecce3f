// Cards de métricas do treinamento: exemplos validados, quality_score do agente, modelo ativo.
import { Card, CardContent } from "@/components/ui/card";
import { Award, Cpu, Database } from "lucide-react";

interface Props {
  validatedCount: number | null;
  agentQuality: number | null;
  agentModel: string | null;
  agentName: string | null;
}

export default function TrainingMetrics({ validatedCount, agentQuality, agentModel, agentName }: Props) {
  const qualityPct = agentQuality != null ? Math.round(agentQuality * 100) : null;
  const qualityColor = qualityPct == null
    ? "text-muted-foreground"
    : qualityPct >= 80 ? "text-green-600" : qualityPct >= 50 ? "text-orange-600" : "text-red-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Database className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Exemplos validados</div>
            <div className="text-2xl font-bold">{validatedCount ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Award className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Qualidade do agente {agentName ?? ""}</div>
            <div className={`text-2xl font-bold ${qualityColor}`}>
              {qualityPct != null ? `${qualityPct}%` : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Modelo recomendado</div>
            <div className="text-sm font-bold truncate" title={agentModel ?? ""}>
              {agentModel ?? "—"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
