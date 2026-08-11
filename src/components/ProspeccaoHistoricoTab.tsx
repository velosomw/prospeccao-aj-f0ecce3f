import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Calendar, CheckCircle2, ClipboardList, FileText, History, Layers, Search } from "lucide-react";
import { supabase } from "@/lib/supabase-any";
import type { Company } from "@/services/companiesService";
import type { ProspeccaoPeriodAnalysis } from "@/services/prospeccaoPeriodService";

interface Props {
  periods: ProspeccaoPeriodAnalysis[];
  companies: Company[];
}

const monthLabels: Record<number, string> = {
  1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
  7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
};

const ProspeccaoHistoricoTab = ({ periods, companies }: Props) => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // Filtros principais
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState<string>("todos");
  const [filterMonth, setFilterMonth] = useState<string>("todos");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("todos");

  // Empresa em foco (detalhes)
  const [focusCompanyId, setFocusCompanyId] = useState<string | null>(null);

  // Contagem de documentos por (company_id, period_label)
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  const companyById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  // Carrega contagem de documentos do pipeline por Prospeccao (prospeccao_id) — usamos como total apurado.
  useEffect(() => {
    const ids = Array.from(new Set(companies.map((c) => c.prospeccao_id).filter(Boolean) as string[]));
    if (ids.length === 0) {
      setDocCounts({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("pipeline_documents")
        .select("prospeccao_id")
        .in("prospeccao_id", ids);
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        counts[r.prospeccao_id] = (counts[r.prospeccao_id] || 0) + 1;
      });
      setDocCounts(counts);
    })();
  }, [companies]);

  // KPIs do ano corrente (totalizadores topo)
  const yearKpis = useMemo(() => {
    const inYear = periods.filter((p) => p.year === currentYear);
    const concluidos = inYear.filter((p) => p.percentual >= 100).length;
    const incompletos = inYear.filter((p) => p.percentual < 100).length;
    const empresas = new Set(inYear.map((p) => p.company_id)).size;
    return { apurados: inYear.length, concluidos, incompletos, empresas };
  }, [periods, currentYear]);

  // Anos disponíveis (combo)
  const availableYears = useMemo(() => {
    const set = new Set<number>(periods.map((p) => p.year));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [periods, currentYear]);

  // Empresas filtradas pela busca + combos
  const matchedCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();

    // Empresas com pelo menos 1 período (ou todas se filtros vazios)
    const companyIdsWithPeriods = new Set(periods.map((p) => p.company_id));

    return companies.filter((c) => {
      // Filtro por empresa (combo direto)
      if (selectedCompanyId !== "todos" && c.id !== selectedCompanyId) return false;

      // Filtro por ano/mês — empresa precisa ter período correspondente
      if (filterYear !== "todos" || filterMonth !== "todos") {
        const has = periods.some(
          (p) =>
            p.company_id === c.id &&
            (filterYear === "todos" || String(p.year) === filterYear) &&
            (filterMonth === "todos" || String(p.month) === filterMonth),
        );
        if (!has) return false;
      } else if (search.trim() === "" && selectedCompanyId === "todos") {
        // Sem filtros ativos → mostra apenas empresas com algum histórico
        if (!companyIdsWithPeriods.has(c.id)) return false;
      }

      // Busca textual
      if (q) {
        const blob = [c.name, c.cnpj, c.prospeccao_id].filter(Boolean).join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [companies, periods, search, filterYear, filterMonth, selectedCompanyId]);

  // Selecionar empresa em foco automaticamente quando filtro deixar 1 só
  useEffect(() => {
    if (selectedCompanyId !== "todos") {
      setFocusCompanyId(selectedCompanyId);
    } else if (matchedCompanies.length === 1) {
      setFocusCompanyId(matchedCompanies[0].id);
    }
  }, [selectedCompanyId, matchedCompanies]);

  const focusCompany = focusCompanyId ? companyById.get(focusCompanyId) : null;
  const focusPeriods = useMemo(
    () => (focusCompanyId ? periods.filter((p) => p.company_id === focusCompanyId) : []),
    [focusCompanyId, periods],
  );

  // KPIs da empresa em foco
  const companyKpis = useMemo(() => {
    const apurados = focusPeriods.length;
    const concluidos = focusPeriods.filter((p) => p.percentual >= 100).length;
    const incompletos = apurados - concluidos;
    const docs = focusCompany?.prospeccao_id ? docCounts[focusCompany.prospeccao_id] || 0 : 0;
    return {
      apurados,
      concluidosPct: apurados > 0 ? Math.round((concluidos / apurados) * 100) : 0,
      incompletosPct: apurados > 0 ? Math.round((incompletos / apurados) * 100) : 0,
      docs,
    };
  }, [focusPeriods, focusCompany, docCounts]);

  // Periodos por ano para o foco
  const periodsByYear = useMemo(() => {
    const m = new Map<number, ProspeccaoPeriodAnalysis[]>();
    focusPeriods.forEach((p) => {
      const arr = m.get(p.year) || [];
      arr.push(p);
      m.set(p.year, arr);
    });
    return m;
  }, [focusPeriods]);

  const olderYears = useMemo(
    () => Array.from(periodsByYear.keys()).filter((y) => y < lastYear).sort((a, b) => b - a),
    [periodsByYear, lastYear],
  );

  const renderMonthRow = (year: number) => {
    const yearPeriods = periodsByYear.get(year) || [];
    const periodByMonth = new Map<number, ProspeccaoPeriodAnalysis>();
    yearPeriods.forEach((p) => periodByMonth.set(p.month, p));

    return (
      <div className="space-y-2">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const p = periodByMonth.get(m);
          const label = `${String(m).padStart(2, "0")}.${year}`;
          const isDone = p && p.percentual >= 100;
          const status = !p
            ? "Sem Prospeccao"
            : p.status === "concluido" || isDone
              ? "Concluído"
              : p.status === "erro"
                ? "Erro"
                : "Em análise";
          return (
            <div
              key={m}
              className={`grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-lg border ${
                p ? "border-border/60 bg-card hover:bg-muted/30" : "border-dashed border-border/30 bg-muted/10 opacity-70"
              } transition-colors`}
            >
              <div className="col-span-2 font-mono text-xs font-semibold text-foreground">{label}</div>
              <div className="col-span-2">
                <Badge
                  variant="outline"
                  className={
                    !p
                      ? "text-[10px] text-muted-foreground"
                      : isDone
                        ? "text-[10px] bg-primary/15 text-primary border-primary/30"
                        : p.status === "erro"
                          ? "text-[10px] bg-destructive/15 text-destructive border-destructive/30"
                          : "text-[10px] bg-accent/15 text-accent border-accent/30"
                  }
                >
                  {status}
                </Badge>
              </div>
              <div className="col-span-4">
                {p ? (
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 w-full max-w-[160px] rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          p.percentual >= 100
                            ? "bg-primary"
                            : p.percentual >= 33
                              ? "bg-accent"
                              : "bg-destructive"
                        }`}
                        style={{ width: `${p.percentual}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-semibold text-foreground">{p.percentual}%</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <div className="col-span-2 text-xs text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3 h-3" />
                {p && focusCompany?.prospeccao_id ? docCounts[focusCompany.prospeccao_id] || 0 : 0} docs
              </div>
              <div className="col-span-2 text-right">
                {p && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => navigate(`/prospeccao/${p.company_id}?period=${p.period_label}`)}
                  >
                    Ver Prospeccao
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const yearTabs = (
    <Tabs defaultValue={String(currentYear)} className="w-full">
      <TabsList className="bg-muted/40 h-10">
        {olderYears.length > 0 && (
          <TabsTrigger value="anteriores" className="text-xs data-[state=active]:bg-accent data-[state=active]:text-white">
            Anos Anteriores
          </TabsTrigger>
        )}
        <TabsTrigger value={String(lastYear)} className="text-xs data-[state=active]:bg-accent data-[state=active]:text-white">
          {lastYear}
        </TabsTrigger>
        <TabsTrigger value={String(currentYear)} className="text-xs data-[state=active]:bg-accent data-[state=active]:text-white">
          {currentYear}
        </TabsTrigger>
      </TabsList>

      {olderYears.length > 0 && (
        <TabsContent value="anteriores" className="mt-4 space-y-6">
          {olderYears.map((y) => (
            <div key={y} className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" /> {y}
              </h4>
              {renderMonthRow(y)}
            </div>
          ))}
        </TabsContent>
      )}

      <TabsContent value={String(lastYear)} className="mt-4">
        {renderMonthRow(lastYear)}
      </TabsContent>
      <TabsContent value={String(currentYear)} className="mt-4">
        {renderMonthRow(currentYear)}
      </TabsContent>
    </Tabs>
  );

  const yearKpiCards = [
    { label: `Prospeccoes Apurados (${currentYear})`, value: yearKpis.apurados, icon: ClipboardList, color: "hsl(var(--accent))" },
    { label: "Concluídos 100%", value: yearKpis.concluidos, icon: CheckCircle2, color: "hsl(var(--primary))" },
    { label: "Incompletos", value: yearKpis.incompletos, icon: Layers, color: "hsl(var(--destructive))" },
    { label: "Empresas", value: yearKpis.empresas, icon: Building2, color: "hsl(var(--ring))" },
  ];

  return (
    <div className="space-y-4">
      {/* Dashboards totalizadores do ano */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {yearKpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${k.color}1A` }}>
                  <Icon className="w-5 h-5" style={{ color: k.color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground leading-none">{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Card de busca histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-accent" /> Histórico de Prospeccoes por Período
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pesquise por empresa, ano ou mês. Selecione uma empresa para ver o detalhamento mensal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa, CNPJ, Prospeccao AJ-ID..."
                className="pl-9"
              />
            </div>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os anos</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {Object.entries(monthLabels).map(([n, l]) => (
                  <SelectItem key={n} value={n}>{n.padStart(2, "0")} — {l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista de empresas resultantes */}
          {matchedCompanies.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhuma empresa encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Prospeccao AJ · Empresa</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">CNPJ</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Prospecções AJ Apurados</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Último Período</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedCompanies.map((c) => {
                    const cPeriods = periods
                      .filter((p) => p.company_id === c.id)
                      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
                    const last = cPeriods[0];
                    const isFocus = focusCompanyId === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setFocusCompanyId(c.id)}
                        className={`border-t cursor-pointer transition-colors ${
                          isFocus ? "bg-accent/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.prospeccao_id && (
                              <Badge className="text-sm font-mono font-semibold bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-0 px-2 py-0.5">
                                {c.prospeccao_id}
                              </Badge>
                            )}
                            <span className="text-base font-semibold text-foreground">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {c.cnpj || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {cPeriods.length}
                        </td>
                        <td className="px-4 py-3">
                          {last ? (
                            <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] text-sm font-mono border-0 px-2 py-0.5">
                              {String(last.month).padStart(2, "0")}/{last.year}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={isFocus ? "default" : "outline"}
                            className="text-xs h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusCompanyId(c.id);
                            }}
                          >
                            {isFocus ? "Selecionado" : "Selecionar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhes da empresa em foco */}
      {focusCompany && (
        <Card className="border-accent/30">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-accent" /> {focusCompany.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {focusCompany.prospeccao_id && (
                    <Badge variant="outline" className="text-[10px] font-mono">{focusCompany.prospeccao_id}</Badge>
                  )}
                  {focusCompany.cnpj && (
                    <span className="text-xs text-muted-foreground">CNPJ {focusCompany.cnpj}</span>
                  )}
                  {focusCompany.sector && (
                    <span className="text-xs text-muted-foreground">• {focusCompany.sector}</span>
                  )}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setFocusCompanyId(null)} className="text-xs">
                Limpar seleção
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* KPIs da empresa */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <p className="text-xs text-muted-foreground">Prospecções AJ Apurados</p>
                <p className="text-2xl font-bold text-foreground">{companyKpis.apurados}</p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <p className="text-xs text-muted-foreground">Concluídos</p>
                <p className="text-2xl font-bold text-primary">{companyKpis.concluidosPct}%</p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <p className="text-xs text-muted-foreground">Incompletos</p>
                <p className="text-2xl font-bold text-destructive">{companyKpis.incompletosPct}%</p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <p className="text-xs text-muted-foreground">Documentos Apurados</p>
                <p className="text-2xl font-bold text-accent">{companyKpis.docs}</p>
              </div>
            </div>

            {/* Abas de ano */}
            {yearTabs}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProspeccaoHistoricoTab;
