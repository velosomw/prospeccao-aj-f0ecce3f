import { useState, useMemo } from "react";
import { Building2, Briefcase, Award, AlertTriangle, TrendingUp, Plus } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import VirtualTable from "@/components/shared/VirtualTable";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";

const statusMeta: Record<string, { bg: string; fg: string }> = {
  "ativa":            { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  "pendente_ativacao":{ bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "inativa":          { bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};

export default function CoordEmpresas() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useCompaniesPage({
    mode: "all",
    page,
    pageSize,
    search,
  });

  const rows = useMemo(() => {
    return (data?.rows ?? []).map((c) => ({
      id: c.id,
      nome: c.name,
      cnpj: c.cnpj || "—",
      prospecçãoId: c.prospecção_id || "—",
      status: c.status || "ativa",
      updatedAt: new Date(c.updated_at).toLocaleDateString("pt-BR"),
    }));
  }, [data]);

  const { data: stats } = useCompaniesStats("all");
  const total = stats?.total ?? data?.total ?? 0;
  const bs = stats?.byStatus ?? {};
  const ativas = bs["ativa"] ?? 0;
  const pendentes = bs["pendente_ativacao"] ?? 0;
  const inativas = bs["inativa"] ?? 0;

  const columns = [
    {
      key: "nome",
      header: "Empresa",
      cell: (e: typeof rows[number]) => (
        <span className="font-medium flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{e.nome}</span>
      ),
    },
    { key: "cnpj", header: "CNPJ", cell: (e: typeof rows[number]) => <span className="font-mono text-xs text-muted-foreground">{e.cnpj}</span> },
    { key: "prospecçãoId", header: "Prospeccao AJ ID", cell: (e: typeof rows[number]) => <span className="font-mono text-xs text-muted-foreground">{e.prospecçãoId}</span> },
    {
      key: "status",
      header: "Status",
      cell: (e: typeof rows[number]) => {
        const s = statusMeta[e.status] || statusMeta["ativa"];
        return <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{e.status}</span>;
      },
    },
    { key: "updatedAt", header: "Atualizado", cell: (e: typeof rows[number]) => <span className="text-xs text-muted-foreground">{e.updatedAt}</span> },
  ];

  return (
    <ConsultorPageShell
      title="Empresas" subtitle="Cadastro e portfólio de empresas atendidas."
      search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
      kpis={[
        { label: "Empresas",      value: total,       hint: "Cadastradas",  icon: Building2,    tone: "blue" },
        { label: "Prospecções AJ Totais",   value: total,       hint: "Acumulado",    icon: Briefcase,    tone: "purple" },
        { label: "Ativas",        value: ativas,      hint: "Em operação",  icon: TrendingUp,   tone: "green" },
        { label: "Pend. Ativação",value: pendentes,   hint: "Aguardando",   icon: AlertTriangle, tone: "orange" },
        { label: "Inativas",      value: inativas,    hint: "Desabilitadas",icon: AlertTriangle, tone: "red" },
        { label: "Score Médio",   value: 0,           hint: "Portfólio",    icon: Award,        tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Portfólio</h3>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary px-3 py-1.5 rounded-md hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Nova empresa
          </button>
        </div>
        {isLoading && (
          <div className="text-center text-muted-foreground py-10 text-sm">Carregando…</div>
        )}
        {!isLoading && (
          <VirtualTable
            data={rows}
            columns={columns}
            rowKey={(e) => e.id}
            defaultPageSize={pageSize}
            maxHeight={480}
            showPagination
            total={total}
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            headerClassName="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider"
            rowClassName="border-t hover:bg-muted/20"
          />
        )}
      </div>
    </ConsultorPageShell>
  );
}
