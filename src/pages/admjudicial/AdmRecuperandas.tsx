import { Building2, Award, AlertTriangle, TrendingUp } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const empresas = [
  { nome: "DIPLOMATA",  proc: "RJ-2024-0012", score: 87, status: "Saudável" },
  { nome: "TECNOMAX",   proc: "RJ-2024-0014", score: 72, status: "Atenção" },
  { nome: "BENTOIA",    proc: "RJ-2024-0009", score: 91, status: "Saudável" },
  { nome: "MOVAG",      proc: "RJ-2023-0089", score: 41, status: "Crítico" },
  { nome: "CONSTRUTEX", proc: "RJ-2023-0076", score: 78, status: "Saudável" },
  { nome: "AGRIBEN",    proc: "RJ-2024-0021", score: 64, status: "Atenção" },
];
const statusMeta: Record<string, { bg: string; fg: string }> = {
  "Saudável": { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  "Atenção":  { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Crítico":  { bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};
const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function AdmRecuperandas() {
  return (
    <ConsultorPageShell
      title="Recuperandas" subtitle="Empresas sob sua administração judicial."
      kpis={[
        { label: "Total",       value: empresas.length, hint: "Sob administração", icon: Building2, tone: "blue" },
        { label: "Saudáveis",   value: empresas.filter(e => e.status === "Saudável").length, hint: "Score ≥ 67", icon: TrendingUp, tone: "green" },
        { label: "Em Atenção",  value: empresas.filter(e => e.status === "Atenção").length, hint: "Monitorar", icon: AlertTriangle, tone: "orange" },
        { label: "Críticas",    value: empresas.filter(e => e.status === "Crítico").length, hint: "Ação urgente", icon: AlertTriangle, tone: "red" },
        { label: "Score Médio", value: Math.round(empresas.reduce((s, e) => s + e.score, 0) / empresas.length), hint: "Portfólio", icon: Award, tone: "blue" },
        { label: "Total Ativas",value: empresas.length, hint: "Em RJ", icon: Building2, tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Recuperandas</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Empresa</th>
              <th className="text-left px-4 py-2.5">Processo</th>
              <th className="text-left px-4 py-2.5">Score</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => {
              const s = statusMeta[e.status];
              return (
                <tr key={e.proc} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{e.nome}</td>
                  <td className="px-4 py-3 font-mono text-primary text-xs">{e.proc}</td>
                  <td className="px-4 py-3"><div className="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: scoreColor(e.score) }}>{e.score}</div></td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{e.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
