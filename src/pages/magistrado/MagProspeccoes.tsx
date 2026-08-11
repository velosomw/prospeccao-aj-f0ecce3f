import { useState, useMemo } from "react";
import { FileText, CheckCircle2, Eye, Clock, Award, AlertTriangle, Download } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import VirtualTable from "@/components/shared/VirtualTable";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";

const statusMeta: Record<string, { bg: string; fg: string }> = {
  "Para análise": { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Visualizado":  { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
};

export default function MagProspeccoes() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useCompaniesPage({
    mode: "released",
    page,
    pageSize,
    search,
  });

  const rows = useMemo(() => {
    return (data?.rows ?? []).map((c) => ({
      id: c.prospeccao_id || `Prospeccao-${c.id.slice(0, 4).toUpperCase()}`,
      empresa: c.name,
      proc: "—",
      periodo: c.current_period_month && c.execution_year
        ? `${String(c.current_period_month).padStart(2, "0")}/${c.execution_year}`
        : "—",
      score: 0,
      status: "Para análise",
      data: new Date(c.updated_at).toLocaleDateString("pt-BR"),
    }));
  }, [data]);

  const { data: stats } = useCompaniesStats("released");
  const total = stats?.total ?? data?.total ?? 0;
  const bs = stats?.byStatus ?? {};
  const paraAnalise = (bs["em_analise"] ?? 0) + (bs["em_revisao"] ?? 0) + (bs["ativa"] ?? 0);
  const concluidos = bs["concluido"] ?? 0;

  const columns = [
    {
      key: "info",
      header: "Prospeccao AJ",
      cell: (r: typeof rows[number]) => {
        const s = statusMeta[r.status];
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5 text-primary" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-primary font-semibold">{r.id}</span>
                <span className="text-xs font-mono text-muted-foreground">• {r.proc}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{r.status}</span>
              </div>
              <div className="text-sm font-semibold">{r.empresa}</div>
              <div className="text-xs text-muted-foreground">Período {r.periodo} • {r.data}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "score",
      header: "Score",
      cell: (r: typeof rows[number]) => (
        <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center bg-muted">{r.score || "—"}</div>
      ),
    },
    {
      key: "acoes",
      header: <span className="text-right w-full block" />,
      cell: (r: typeof rows[number]) => (
        <div className="inline-flex items-center gap-1">
          <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Eye className="w-4 h-4" /></button>
          <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Download className="w-4 h-4" /></button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <ConsultorPageShell
      title="Prospecções AJ Recebidos" subtitle="Relatórios de Monitoramento das empresas de prospeccao para análise judicial."
      search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
      kpis={[
        { label: "Prospecções AJ (30d)",    value: total, hint: "Recebidos",    icon: FileText,     tone: "blue" },
        { label: "Para Análise",  value: paraAnalise,  hint: "Pendente",     icon: AlertTriangle, tone: "orange" },
        { label: "Visualizados",  value: 0,   hint: "Lidos",        icon: Eye,          tone: "green" },
        { label: "Score Médio",   value: 0, hint: "Qualidade",    icon: Award,        tone: "blue" },
        { label: "Tempo Médio",   value: "—", hint: "Para leitura", icon: Clock,    tone: "slate" },
        { label: "Concluídos",    value: concluidos, hint: "Histórico",    icon: CheckCircle2, tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Prospecções AJ Recebidos</h3></div>
        {isLoading && (
          <div className="text-center text-muted-foreground py-10 text-sm">Carregando…</div>
        )}
        {!isLoading && (
          <VirtualTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            defaultPageSize={pageSize}
            maxHeight={480}
            showPagination
            total={total}
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            headerClassName="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider"
            rowClassName="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors"
          />
        )}
      </div>
    </ConsultorPageShell>
  );
}
