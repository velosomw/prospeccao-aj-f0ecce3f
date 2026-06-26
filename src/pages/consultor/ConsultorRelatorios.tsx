import { useMemo, useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import PlanilhaTable from "@/components/PlanilhaTable";
import bexData from "@/data/bexPlanilhaPadrao.json";
import {
  FileBarChart, Download, Eye, CheckCircle2, FileText, Building2, Briefcase,
} from "lucide-react";

interface Rel { id: string; titulo: string; rma: string; empresa: string; periodo: string; status: "publicado"|"rascunho"|"revisao"; score: number; data: string; }

const rels: Rel[] = [
  { id: "REL-201", titulo: "RMA Janeiro/2026 - DIPLOMATA",  rma: "RMA-DIP-01-2026", empresa: "DIPLOMATA",  periodo: "01/2026", status: "publicado", score: 87, data: "Há 4h" },
  { id: "REL-200", titulo: "RMA Dezembro/2025 - DIPLOMATA", rma: "RMA-DIP-12-2025", empresa: "DIPLOMATA",  periodo: "12/2025", status: "publicado", score: 82, data: "Há 1d" },
  { id: "REL-199", titulo: "RMA Novembro/2025 - DIPLOMATA", rma: "RMA-DIP-11-2025", empresa: "DIPLOMATA",  periodo: "11/2025", status: "revisao",   score: 74, data: "Há 3d" },
];

const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  publicado: { label: "Publicado",  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  revisao:   { label: "Em Revisão", bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  rascunho:  { label: "Rascunho",   bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" },
};

const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function ConsultorRelatorios() {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const byEmpresa: Record<string, Record<string, Rel[]>> = {};
    for (const r of rels) {
      byEmpresa[r.empresa] ??= {};
      byEmpresa[r.empresa][r.rma] ??= [];
      byEmpresa[r.empresa][r.rma].push(r);
    }
    return byEmpresa;
  }, []);

  return (
    <ConsultorPageShell
      title="Planilha"
      subtitle="Documentos finais organizados por empresa, RMA e período."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Publicados",      value: rels.filter(r => r.status === "publicado").length, hint: "Total geral", icon: CheckCircle2, tone: "green"  },
        { label: "Em Revisão",      value: rels.filter(r => r.status === "revisao").length,   hint: "Aguardando",  icon: Eye,          tone: "orange" },
        { label: "Rascunhos",       value: rels.filter(r => r.status === "rascunho").length,  hint: "Em construção",icon: FileText,    tone: "purple" },
        { label: "Empresas",        value: Object.keys(grouped).length,                       hint: "Distintas",   icon: Building2,    tone: "blue"   },
        { label: "RMAs",            value: Object.values(grouped).reduce((a, b) => a + Object.keys(b).length, 0), hint: "No período", icon: Briefcase, tone: "blue" },
        { label: "Score Médio",     value: rels.length ? Math.round(rels.reduce((a, b) => a + b.score, 0) / rels.length) : 0, hint: "Qualidade IA", icon: FileBarChart, tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Planilha&nbsp; carregada & status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              BEx — Planilha Padrão Prospecção Administrador Judicial
            </p>
          </div>
          <button className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>
        <PlanilhaTable data={bexData as unknown[][]} />
      </div>
    </ConsultorPageShell>
  );
}
