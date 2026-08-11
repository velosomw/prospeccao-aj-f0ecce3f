import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase, CheckCircle2, Activity, AlertTriangle, Award, Building2, Eye, BarChart3, MoreVertical,
} from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import VirtualTable from "@/components/shared/VirtualTable";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";

type Filter = "todos" | "em_processamento" | "em_revisao" | "concluido" | "pendente";

const stageMeta: Record<string, { label: string; bg: string; fg: string }> = {
  em_processamento: { label: "Em Análise IA", bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,40%)" },
  em_revisao:       { label: "Em Revisão",    bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  concluido:        { label: "Concluído",     bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  pendente:         { label: "Pendente",      bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};

export default function ConsultorProspeccoes() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const statusFilter = useMemo(() => {
    if (filter === "todos") return null;
    if (filter === "pendente") return "pendente_ativacao";
    return null;
  }, [filter]);

  const { data, isLoading } = useCompaniesPage({
    mode: "assigned",
    page,
    pageSize,
    search,
    status: statusFilter,
  });

  const rows = useMemo(() => {
    return (data?.rows ?? []).map((c) => ({
      id: c.prospeccao_id || `Prospeccao-${c.id.slice(0, 4).toUpperCase()}`,
      empresa: c.name,
      status: (c.status === "pendente_ativacao" ? "pendente" :
               c.status === "ativa" ? "em_processamento" :
               c.status === "em_revisao" ? "em_revisao" :
               c.status === "concluido" ? "concluido" : "em_processamento") as Filter,
      percentual: 0,
      coordenador: "—",
      dataAtualizacao: new Date(c.updated_at).toLocaleDateString("pt-BR"),
    }));
  }, [data]);

  const total = data?.total ?? 0;
  const { data: backendStats } = useCompaniesStats("assigned");
  const bs = backendStats?.byStatus ?? {};

  const stats = useMemo(() => {
    return {
      total: backendStats?.total ?? total,
      proc: (bs["em_analise"] ?? 0) + (bs["ativa"] ?? 0),
      rev:  bs["em_revisao"] ?? 0,
      done: bs["concluido"] ?? 0,
      pend: bs["pendente_ativacao"] ?? 0,
      avg:  0,
    };
  }, [backendStats, bs, total]);

  const openProspeccao = (companyId?: string) => {
    if (companyId) navigate(`/prospeccao/${companyId}`);
  };

  const columns = [
    {
      key: "id",
      header: "ID",
      cell: (r: typeof rows[number]) => (
        <button onClick={() => navigate(`/prospeccao/${r.id}`)} className="font-mono text-primary font-semibold hover:underline">
          {r.id}
        </button>
      ),
    },
    {
      key: "empresa",
      header: "Empresa",
      cell: (r: typeof rows[number]) => (
        <span className="font-medium flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{r.empresa}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r: typeof rows[number]) => {
        const m = stageMeta[r.status];
        return <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
      },
    },
    {
      key: "progresso",
      header: "Progresso",
      cell: (r: typeof rows[number]) => (
        <div className="flex items-center gap-2 w-40">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${r.percentual}%` }} />
          </div>
          <span className="text-xs font-semibold text-foreground w-9">{r.percentual}%</span>
        </div>
      ),
    },
    { key: "coordenador", header: "Coordenador", cell: (r: typeof rows[number]) => <span className="text-muted-foreground">{r.coordenador}</span> },
    { key: "dataAtualizacao", header: "Atualização", cell: (r: typeof rows[number]) => <span className="text-muted-foreground text-xs">{r.dataAtualizacao}</span> },
    {
      key: "acoes",
      header: <span className="text-right w-full block" />,
      cell: (r: typeof rows[number]) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => openProspeccao(r.id)} className="text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
          <button className="text-muted-foreground hover:text-foreground"><BarChart3 className="w-4 h-4" /></button>
          <button className="text-muted-foreground hover:text-foreground"><MoreVertical className="w-4 h-4" /></button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <ConsultorPageShell
      title="Prospeccoes AJ" subtitle="Todos os Relatórios de Monitoramento sob sua responsabilidade."
      search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
      kpis={[
        { label: "Prospeccoes AJ Totais",  value: stats.total, hint: "No período",      icon: Briefcase,     tone: "blue" },
        { label: "Em Análise IA",value: stats.proc,  hint: "Processando",     icon: Activity,      tone: "purple" },
        { label: "Em Revisão",   value: stats.rev,   hint: "Aguardando você", icon: Eye,           tone: "orange" },
        { label: "Concluídos",   value: stats.done,  hint: "Finalizados",     icon: CheckCircle2,  tone: "green" },
        { label: "Pendentes",    value: stats.pend,  hint: "Aguardando dados",icon: AlertTriangle, tone: "red" },
        { label: "Score Médio",  value: stats.avg,   hint: "Saúde geral",     icon: Award,         tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Lista de Prospeccoes AJ</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{total}</span>
          </div>
          <div className="flex items-center gap-1">
            {(["todos","em_processamento","em_revisao","concluido","pendente"] as Filter[]).map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1); }}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}>
                {f === "todos" ? "Todos" : stageMeta[f].label}
              </button>
            ))}
          </div>
        </div>
        {isLoading && (
          <div className="text-center text-muted-foreground py-10 text-sm">Carregando…</div>
        )}
        {!isLoading && (
          <VirtualTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            defaultPageSize={pageSize}
            maxHeight={560}
            showPagination
            total={total}
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            headerClassName="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider"
            rowClassName={(_r, i) => `border-t hover:bg-muted/40 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/30"}`}
            onRowClick={(r) => openProspeccao(r.id)}
          />

        )}
      </div>
    </ConsultorPageShell>
  );
}
