import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-any";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, Database, BarChart3, AlertTriangle } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface ChartRow {
  id: string;
  tipo: string;
  titulo: string;
  descricao_ia: string | null;
  dados: any;
}
interface SourceRow {
  id: string;
  source_type: string;
  periodo_label: string | null;
  trecho: string | null;
}

const COLORS = ["hsl(217,91%,50%)", "hsl(262,83%,58%)", "hsl(38,92%,50%)", "hsl(142,76%,36%)", "hsl(0,84%,60%)"];

const groundingMeta = (score: number) => {
  if (score >= 80) return { label: "Bem ancorado", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200", Icon: ShieldCheck };
  if (score >= 50) return { label: "Ancoragem parcial", cls: "bg-amber-500/10 text-amber-700 border-amber-200", Icon: ShieldAlert };
  return { label: "Baixa ancoragem", cls: "bg-red-500/10 text-red-700 border-red-200", Icon: ShieldAlert };
};

interface Props {
  sectionId: string;
  graficosIds: string[];
  groundingScore: number;
  ungroundedClaims: string[];
  kpis: Array<{ label: string; valor: any; unidade?: string; periodo?: string }>;
}

export const SectionGovernanceCard = ({
  sectionId, graficosIds, groundingScore, ungroundedClaims, kpis,
}: Props) => {
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (graficosIds?.length) {
        const { data } = await (supabase
          .from("prospeccao_document_charts") as any)
          .select("id,tipo,titulo,descricao_ia,dados")
          .in("id", graficosIds);
        if (!cancelled) setCharts((data || []) as any);
      } else {
        setCharts([]);
      }
      const { data: src } = await (supabase
        .from("prospeccao_section_data_sources") as any)
        .select("id,source_type,periodo_label,trecho")
        .eq("section_id", sectionId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) setSources((src || []) as any);
    })();
    return () => { cancelled = true; };
  }, [sectionId, graficosIds?.join(",")]);

  const gm = groundingMeta(groundingScore || 0);

  const renderChart = (c: ChartRow) => {
    const series: any[] = c?.dados?.series || [];
    if (!series.length) return null;
    if (c.tipo === "linha") {
      return (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={series}>
            <XAxis dataKey={c.dados.x || "periodo"} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Line type="monotone" dataKey={c.dados.y || "valor"} stroke={COLORS[0]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    if (c.tipo === "barra") {
      const ys: string[] = Array.isArray(c.dados.y) ? c.dados.y : [c.dados.y || "valor"];
      return (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={series}>
            <XAxis dataKey={c.dados.x || "periodo"} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {ys.map((y, i) => <Bar key={y} dataKey={y} fill={COLORS[i % COLORS.length]} />)}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (c.tipo === "pizza") {
      return (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={series} dataKey={c.dados.value || "valor"} nameKey={c.dados.label || "categoria"} outerRadius={70} label fontSize={10}>
              {series.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  return (
    <Card className="p-4 space-y-4 bg-muted/20">
      {/* Linha de governança */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`gap-1 ${gm.cls}`}>
            <gm.Icon className="w-3 h-3" /> Grounding {groundingScore || 0}/100 · {gm.label}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Database className="w-3 h-3" /> {sources.length} fontes
          </Badge>
          <Badge variant="outline" className="gap-1">
            <BarChart3 className="w-3 h-3" /> {charts.length} gráficos
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      {kpis?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {kpis.slice(0, 8).map((k, i) => (
            <div key={i} className="rounded-md border bg-background p-2">
              <p className="text-[10px] uppercase text-muted-foreground">{k.label}</p>
              <p className="text-sm font-semibold tabular-nums">
                {typeof k.valor === "number"
                  ? k.unidade === "BRL"
                    ? k.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : `${k.valor}${k.unidade && k.unidade !== "BRL" ? " " + k.unidade : ""}`
                  : "—"}
              </p>
              {k.periodo && <p className="text-[10px] text-muted-foreground">{k.periodo}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Ungrounded claims (alertas críticos) */}
      {ungroundedClaims?.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
          <p className="font-semibold text-amber-800 flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3" /> {ungroundedClaims.length} valor(es) sem origem identificada
          </p>
          <p className="text-amber-700">
            {ungroundedClaims.slice(0, 6).join(" · ")}
            {ungroundedClaims.length > 6 && " …"}
          </p>
        </div>
      )}

      {/* Gráficos */}
      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {charts.map((c) => (
            <div key={c.id} className="rounded-md border bg-background p-2">
              <p className="text-xs font-semibold mb-1">{c.titulo}</p>
              {renderChart(c)}
              {c.descricao_ia && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{c.descricao_ia}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lista de fontes */}
      {sources.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Origem dos dados ({sources.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {sources.slice(0, 30).map((s) => (
              <li key={s.id} className="flex gap-2 items-baseline">
                <Badge variant="outline" className="text-[9px]">{s.source_type}</Badge>
                <span className="text-muted-foreground">{s.periodo_label || ""}</span>
                <span className="truncate">{s.trecho}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
};

export default SectionGovernanceCard;
