import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConsultorPageShell from "@/components/consultor/PageShell";
import {
  FileBarChart, Download, Eye, CheckCircle2, Clock, FileText,
  ChevronDown, ChevronRight, Building2, Briefcase,
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ DIPLOMATA: true });

  // Group: empresa → RMAs → relatórios
  const grouped = useMemo(() => {
    const s = search.toLowerCase();
    const filtered = rels.filter(r =>
      !s || r.titulo.toLowerCase().includes(s) || r.empresa.toLowerCase().includes(s) || r.rma.toLowerCase().includes(s)
    );
    const byEmpresa: Record<string, Record<string, Rel[]>> = {};
    for (const r of filtered) {
      byEmpresa[r.empresa] ??= {};
      byEmpresa[r.empresa][r.rma] ??= [];
      byEmpresa[r.empresa][r.rma].push(r);
    }
    return byEmpresa;
  }, [search]);

  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

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
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">Planilha&nbsp; carregada & status</h3>
          <button className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> Exportar Lote
          </button>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum relatório encontrado.</div>
        ) : (
          <div className="divide-y">
            {Object.entries(grouped).map(([empresa, rmas]) => {
              const opened = open[empresa];
              const total = Object.values(rmas).reduce((a, b) => a + b.length, 0);
              return (
                <div key={empresa}>
                  <button
                    onClick={() => toggle(empresa)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20"
                  >
                    {opened ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Building2 className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold">{empresa}</div>
                      <div className="text-xs text-muted-foreground">
                        {Object.keys(rmas).length} RMA(s) · {total} relatório(s)
                      </div>
                    </div>
                  </button>

                  {opened && (
                    <div className="pl-12 pr-4 pb-3 space-y-2">
                      {Object.entries(rmas).map(([rma, items]) => (
                        <div key={rma} className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/30 px-3 py-2 text-xs font-semibold flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                            {rma}
                            <span className="ml-auto text-muted-foreground font-normal">
                              {items.length} relatório(s) · {items[0].periodo}
                            </span>
                          </div>
                          <div className="divide-y">
                            {items.map(r => {
                              const s = statusMeta[r.status];
                              return (
                                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/10">
                                  <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                                    <FileBarChart className="w-4 h-4 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold truncate">{r.titulo}</div>
                                    <div className="text-[11px] text-muted-foreground">{r.id} · {r.data}</div>
                                  </div>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                                  <div className="flex items-center gap-1 w-16 justify-end">
                                    <span className="text-xs font-bold" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                                    <span className="text-[10px] text-muted-foreground">/100</span>
                                  </div>
                                  <button
                                    onClick={() => navigate(`/rma/${r.rma}`)}
                                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Abrir
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ConsultorPageShell>
  );
}
