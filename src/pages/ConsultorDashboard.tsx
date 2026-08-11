import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import {
  Mail, CheckCircle2, Activity, AlertTriangle, Send, Building2,
  Search, Eye, BarChart3, MoreVertical, Lightbulb, ArrowRight, FileText, Info,
  Upload, FileWarning, RefreshCw,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, LineChart, Line, LabelList,
} from "recharts";
import PlatformLayout from "@/components/PlatformLayout";
import VirtualTable from "@/components/shared/VirtualTable";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";

type StageFilter = "todos" | "em_analise" | "em_revisao" | "pausados";

const stageMeta: Record<string, { label: string; bg: string; fg: string }> = {
  em_analise: { label: "Em Processamento IA", bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,40%)" },
  em_revisao: { label: "Em Elaboração",      bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)" },
  concluido:  { label: "Carta Enviada",      bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  pausado:    { label: "Falha PDF",           bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};

const envioClass = (s: number) => {
  if (s < 31) return { dot: "hsl(0,84%,60%)",  label: "Não enviada" };
  if (s < 61) return { dot: "hsl(38,92%,50%)", label: "Em elaboração" };
  if (s < 81) return { dot: "hsl(48,96%,53%)", label: "Reenvio pendente" };
  return { dot: "hsl(142,76%,36%)", label: "Enviada" };
};

const formatRelative = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (!d) return "—";
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `Há ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Há ${h}h`;
  return `Há ${Math.floor(h / 24)}d`;
};

export default function ConsultorDashboard() {
  const navigate = useNavigate();
  const { userName } = useUser();
  const firstName = userName?.split(" ")[0] || "Consultor";

  const [filter, setFilter] = useState<StageFilter>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const statusFilter = useMemo(() => {
    if (filter === "todos") return null;
    if (filter === "pausados") return "pausada";
    return null;
  }, [filter]);

  const { data, isLoading } = useCompaniesPage({
    mode: "assigned",
    page,
    pageSize,
    search,
    status: statusFilter,
  });

  const { data: stats } = useCompaniesStats("assigned");
  const companiesTotal = stats?.total ?? data?.total ?? 0;
  const byStatus = stats?.byStatus ?? {};
  const countAnalise = (byStatus["em_analise"] ?? 0) + (byStatus["ativa"] ?? 0);
  const countRevisao = byStatus["em_revisao"] ?? 0;
  const countConcluido = byStatus["concluido"] ?? 0;
  const countPausado = byStatus["pausada"] ?? 0;
  const countPendente = byStatus["pendente_ativacao"] ?? 0;

  const rows = useMemo(() => {
    return (data?.rows ?? []).map((c) => {
      const envio = 0; // status de envio virá do processamento; por ora placeholder
      const stage =
        c.status === "concluido" ? "concluido" :
        c.status === "em_revisao" ? "em_revisao" :
        c.status === "pausada" ? "pausado" :
        "em_analise";
      return {
        id: c.prospecção_id || `CARTA-${c.id.slice(0, 4).toUpperCase()}`,
        companyId: c.id,
        empresa: c.name,
        periodo: c.current_period_month && c.execution_year
          ? `${["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][c.current_period_month]}/${c.execution_year}`
          : "—",
        stage,
        progresso: envio,
        envio,
        pendencias: Math.max(0, Math.round((100 - envio) / 4)),
        criticas: envio < 50 ? Math.max(1, Math.round((100 - envio) / 12)) : 0,
        atualizado: formatRelative(c.updated_at),
      };
    });
  }, [data]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (filter === "todos") return true;
      if (filter === "em_analise") return r.stage === "em_analise";
      if (filter === "em_revisao") return r.stage === "em_revisao";
      if (filter === "pausados") return r.stage === "pausado";
      return true;
    });
  }, [rows, filter]);

  const hasStats = !!stats;
  const total = hasStats ? companiesTotal : (companiesTotal || 0);
  const emProcessamento = hasStats ? (countAnalise + countRevisao) : (rows.filter(r => r.stage === "em_analise" || r.stage === "em_revisao").length || 0);
  const enviadas = hasStats ? countConcluido : (rows.filter(r => r.stage === "concluido").length || 0);
  const falhaPdf = hasStats ? countPausado : (rows.filter(r => r.stage === "pausado").length || 0);

  const uploadsPendentes = rows.reduce((s, r) => s + r.pendencias, 0) || 0;
  const criticas = rows.reduce((s, r) => s + r.criticas, 0) || 0;
  const taxaEnvio = rows.length
    ? Math.round(rows.filter(r => r.envio >= 81).length / rows.length * 100)
    : 0;
  const empresasComCarta = total;

  const safePct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const kpis = [
    { label: "Total de Cartas",         value: total,            sub: "No período atual",         icon: Mail,         color: "hsl(217,91%,50%)" },
    { label: "Cartas em Processamento", value: emProcessamento,  sub: `${safePct(emProcessamento)}% do total`, icon: Activity,    color: "hsl(258,90%,56%)" },
    { label: "Uploads Pendentes",       value: uploadsPendentes, sub: `Críticas: ${criticas}`,   icon: Upload,       color: "hsl(38,92%,50%)" },
    { label: "Cartas Enviadas",         value: enviadas,         sub: `${safePct(enviadas)}% do total`, icon: Send,        color: "hsl(142,76%,36%)" },
    { label: "Taxa de Envio",            value: `${taxaEnvio}%`,  sub: "↑ 8 pts vs. período anterior", icon: CheckCircle2, color: "hsl(217,91%,50%)" },
    { label: "Empresas com Carta",      value: empresasComCarta, sub: "Ativas no período",       icon: Building2,   color: "hsl(217,91%,50%)" },
  ];

  const statusData = [
    { name: "Em Processamento IA", value: hasStats ? countAnalise : (rows.filter(r => r.stage === "em_analise").length || 0), color: "hsl(258,90%,56%)" },
    { name: "Em Elaboração",        value: hasStats ? countRevisao : (rows.filter(r => r.stage === "em_revisao").length || 0), color: "hsl(38,92%,50%)"  },
    { name: "Cartas Enviadas",      value: enviadas,  color: "hsl(142,76%,36%)" },
    { name: "Falha PDF",            value: falhaPdf,  color: "hsl(0,84%,60%)"   },
  ];
  const totalStatus = statusData.reduce((s, x) => s + x.value, 0);

  const reenvioBuckets = [
    { faixa: "90 dias",  cls: "Em prazo",  count: rows.filter(r => r.envio >= 81).length || 0,            color: "hsl(142,76%,36%)" },
    { faixa: "120 dias", cls: "Próximo",  count: rows.filter(r => r.envio >= 61 && r.envio < 81).length || 0, color: "hsl(48,96%,53%)" },
    { faixa: "150 dias", cls: "Atrasado", count: rows.filter(r => r.envio >= 31 && r.envio < 61).length || 0, color: "hsl(38,92%,50%)" },
    { faixa: "Vencidas", cls: "Vencida",  count: rows.filter(r => r.envio < 31).length || 0,            color: "hsl(0,84%,60%)"   },
  ];

  const evolucao = [
    { mes: "Fev/2026", enviadas: 48 },
    { mes: "Mar/2026", enviadas: 52 },
    { mes: "Abr/2026", enviadas: 56 },
    { mes: "Mai/2026", enviadas: enviadas || 62 },
  ];

  const openCarta = (companyId?: string) => {
    if (companyId) navigate(`/consultor/clientes`);
  };

  const topPendencias: any[] = [];
  const ativIA: any[] = [];
  const recomendadas: any[] = [];

  type Row = typeof filteredRows[number];

  const cartaColumns = [
    {
      key: "id",
      header: "ID Carta",
      cell: (r: Row) => (
        <button onClick={() => openCarta(r.companyId)} className="font-semibold text-[hsl(217,91%,50%)] hover:underline">
          {r.id}
        </button>
      ),
    },
    { key: "empresa", header: "Empresa / AJ", cell: (r: Row) => <span className="text-foreground">{r.empresa}</span> },
    { key: "periodo", header: "Período", cell: (r: Row) => <span className="text-muted-foreground">{r.periodo}</span> },
    {
      key: "etapa",
      header: "Etapa Atual",
      cell: (r: Row) => {
        const sm = stageMeta[r.stage] || stageMeta.em_analise;
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ background: sm.bg, color: sm.fg }}>
            {sm.label}
          </span>
        );
      },
    },
    {
      key: "progresso",
      header: "Progresso",
      cell: (r: Row) => (
        <div className="flex items-center gap-2 w-[140px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${r.progresso}%`, background: "hsl(217,91%,50%)" }} />
          </div>
          <span className="text-xs font-semibold text-foreground">{r.progresso}%</span>
        </div>
      ),
    },
    {
      key: "envio",
      header: "Status Envio",
      cell: (r: Row) => {
        const sc = envioClass(r.envio);
        return (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: sc.dot }} />
            <span className="font-semibold">{sc.label}</span>
          </div>
        );
      },
    },
    {
      key: "pendencias",
      header: <span className="inline-flex items-center gap-1">Uploads <Info className="w-3 h-3 text-muted-foreground/60" /></span>,
      cell: (r: Row) => (
        <div>
          <div className="text-sm font-semibold text-foreground">{r.pendencias}</div>
          {r.criticas > 0 && <div className="text-[11px] text-[hsl(0,84%,60%)]">{r.criticas} críticas</div>}
        </div>
      ),
    },
    { key: "atualizado", header: "Atualização", cell: (r: Row) => <span className="text-xs text-muted-foreground">{r.atualizado}</span> },
    {
      key: "acoes",
      header: <span className="text-right w-full block">Ações</span>,
      cell: (r: Row) => (
        <div className="inline-flex items-center gap-1">
          <button onClick={() => openCarta(r.companyId)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Visualizar Carta"><Eye className="w-4 h-4" /></button>
          <button onClick={() => openCarta(r.companyId)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Gráficos"><BarChart3 className="w-4 h-4" /></button>
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Mais ações"><MoreVertical className="w-4 h-4" /></button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <PlatformLayout>
      <div className="bg-[hsl(220,20%,97%)] min-h-full">
        <div className="px-6 pt-6 pb-4 bg-white border-b border-border">
          <div className="max-w-[1500px] mx-auto flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Olá, {firstName}! <span className="inline-block">👋</span></h1>
              <p className="text-sm text-muted-foreground">Aqui está o resumo dos processos de cartas, uploads e envios.</p>
            </div>
            <div className="lg:w-[420px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por empresa, ID Carta ou CNPJ..."
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-[hsl(220,20%,97%)] border border-border text-sm outline-none focus:border-[hsl(217,91%,50%)]"
              />
            </div>
          </div>
        </div>

        <div className="max-w-[1500px] mx-auto p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs text-muted-foreground">{k.label}</div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${k.color}1A` }}>
                      <Icon className="w-4 h-4" style={{ color: k.color }} />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-foreground leading-tight">{k.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{k.sub}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-border rounded-xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">Visão Geral de Status</div>
              <div className="flex items-center gap-3">
                <div className="relative w-[160px] h-[160px] flex-shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={3} stroke="white" strokeWidth={2}>
                        {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-2xl font-bold">{totalStatus}</div>
                    <div className="text-[10px] text-muted-foreground">Total</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-xs">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-foreground">{s.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {s.value} <span className="text-[10px]">({totalStatus ? Math.round(s.value/totalStatus*100*10)/10 : 0}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">Distribuição de Prazos de Reenvio</div>
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <BarChart data={reenvioBuckets} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                    <XAxis dataKey="faixa" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(220,15%,45%)" }} />
                    <YAxis hide />
                    <Tooltip cursor={{ fill: "hsl(220,20%,97%)" }} />
                    <Bar dataKey="count" radius={[8,8,0,0]} maxBarSize={56}>
                      {reenvioBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                      <LabelList dataKey="count" position="top" style={{ fill: "hsl(222,47%,14%)", fontSize: 13, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 text-center text-[10px] text-muted-foreground -mt-2">
                {reenvioBuckets.map(b => <div key={b.faixa} style={{ color: b.color }}>{b.cls}</div>)}
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-foreground">Evolução de Cartas Enviadas</div>
                <button className="text-[11px] font-semibold text-[hsl(217,91%,50%)] hover:underline flex items-center gap-1">
                  Ver histórico <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <LineChart data={evolucao} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(220,15%,45%)" }} />
                    <YAxis hide domain={["dataMin - 6", "dataMax + 6"]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="enviadas" stroke="hsl(142,76%,36%)" strokeWidth={2.5}
                      dot={{ r: 6, fill: "white", stroke: "hsl(142,76%,36%)", strokeWidth: 2.5 }} activeDot={{ r: 7 }}>
                      <LabelList dataKey="enviadas" position="top" style={{ fill: "hsl(222,47%,14%)", fontSize: 12, fontWeight: 700 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Lista de Cartas com paginação + virtualização (backend) */}
          <div className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-foreground">Cartas em Processamento</div>
                <span className="text-xs font-bold w-6 h-6 rounded-full bg-[hsl(258,90%,96%)] text-[hsl(258,90%,40%)] flex items-center justify-center">{emProcessamento}</span>
              </div>
              <div className="flex items-center gap-2">
                {([ ["todos", "Todos"], ["em_analise", "Em Processamento IA"], ["em_revisao", "Em Elaboração"], ["pausados", "Falha PDF"] ] as [StageFilter, string][]).map(([k, label]) => {
                  const active = filter === k;
                  return (
                    <button key={k} onClick={() => { setFilter(k); setPage(1); }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        active ? "border-[hsl(217,91%,50%)] text-[hsl(217,91%,50%)] bg-[hsl(217,91%,97%)]" : "border-transparent text-muted-foreground hover:bg-muted/40"
                      }`}>
                      {label}
                    </button>
                  );
                })}
                <button className="text-xs font-semibold text-[hsl(217,91%,50%)] hover:underline ml-2 flex items-center gap-1">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {isLoading && (
              <div className="text-center text-muted-foreground py-10 text-sm">Carregando…</div>
            )}
            {!isLoading && (
              <VirtualTable
                data={filteredRows}
                columns={cartaColumns}
                rowKey={(r) => `${r.companyId ?? "mock"}-${r.id}`}
                defaultPageSize={pageSize}
                maxHeight={480}
                showPagination
                total={companiesTotal}
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-foreground">Top Pendências de Envio <span className="text-xs font-bold text-[hsl(0,84%,60%)] ml-1">{criticas}</span></div>
                <button className="text-[11px] font-semibold text-[hsl(217,91%,50%)] hover:underline flex items-center gap-1">
                  Ver todas <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-3">
                {topPendencias.map((p, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 pb-3 border-b border-border/60 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.titulo}</div>
                      <div className="text-[11px] text-muted-foreground">{p.prospecção}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground whitespace-nowrap">{p.tempo}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-foreground">Processamentos de Carta <span className="text-xs text-muted-foreground font-noprospecçãol ml-1">(Últimas 24h)</span></div>
                <button className="text-[11px] font-semibold text-[hsl(217,91%,50%)] hover:underline flex items-center gap-1">
                  Ver logs <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-3">
                {ativIA.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="text-[11px] font-mono text-muted-foreground pt-0.5">{a.hora}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{a.titulo}</div>
                      <div className="text-[11px] text-muted-foreground">{a.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">Ações Recomendadas</div>
              <div className="space-y-3">
                {recomendadas.map((rec, i) => {
                  const Icon = rec.icon;
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${rec.color}1A` }}>
                        <Icon className="w-3 h-3" style={{ color: rec.color }} />
                      </div>
                      <div className="text-sm text-foreground">{rec.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PlatformLayout>
  );
}
