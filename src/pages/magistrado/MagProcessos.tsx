import { Gavel, Building2, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const procs = [
  { id: "RJ-2024-0012", empresa: "DIPLOMATA",  fase: "AGC convocada",       inicio: "12/03/2024", status: "Em Andamento", urgencia: "alta" },
  { id: "RJ-2024-0014", empresa: "TECNOMAX",   fase: "Plano apresentado",   inicio: "08/04/2024", status: "Em Andamento", urgencia: "media" },
  { id: "RJ-2024-0009", empresa: "BENTOIA",    fase: "Habilitação créditos",inicio: "22/02/2024", status: "Em Andamento", urgencia: "media" },
  { id: "RJ-2023-0089", empresa: "MOVAG",      fase: "Deliberação plano",   inicio: "11/11/2023", status: "Decisão",       urgencia: "alta" },
  { id: "RJ-2023-0076", empresa: "CONSTRUTEX", fase: "Encerrado",           inicio: "05/09/2023", status: "Encerrado",     urgencia: "baixa" },
];
const statusMeta: Record<string, { bg: string; fg: string }> = {
  "Em Andamento": { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)" },
  "Decisão":      { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Encerrado":    { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
};

export default function MagProcessos() {
  return (
    <ConsultorPageShell
      title="Processos" subtitle="Recuperações judiciais sob sua jurisdição."
      kpis={[
        { label: "Total Ativos", value: 33, hint: "Em curso",          icon: Gavel,        tone: "blue" },
        { label: "Recuperandas",  value: 18, hint: "Empresas",         icon: Building2,    tone: "purple" },
        { label: "Em AGC",        value: 7,  hint: "Assembleia",       icon: Clock,        tone: "orange" },
        { label: "Decisão",       value: 4,  hint: "Aguardando",       icon: AlertTriangle, tone: "red" },
        { label: "Encerrados",    value: 9,  hint: "Últimos 12m",      icon: CheckCircle2, tone: "green" },
        { label: "Tempo Médio",   value: "14d", hint: "Para decisão",  icon: Clock,        tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Processos</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Processo</th>
              <th className="text-left px-4 py-2.5">Recuperanda</th>
              <th className="text-left px-4 py-2.5">Fase</th>
              <th className="text-left px-4 py-2.5">Início</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {procs.map(p => {
              const s = statusMeta[p.status];
              return (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-primary font-semibold">{p.id}</td>
                  <td className="px-4 py-3 font-medium">{p.empresa}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.fase}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.inicio}</td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{p.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
