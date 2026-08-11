// Página "Relatórios Contábeis" — seleciona Empresa → Prospeccao → Período/Foprospecçãoto e gera o
// Relatório Contábil de Dados (DOCX/PDF) usando balancete_consolidado da empresa.
import { useEffect, useMemo, useState } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileBarChart, Building2, Briefcase, ChevronLeft, Download, Search, FileText, FileType2,
} from "lucide-react";
import { listMyAssignedCompanies, listCompanies, type Company } from "@/services/companiesService";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useConsolidadoBS } from "@/hooks/useConsolidadoBS";
import { buildBSDados } from "@/services/bsDadosBuilder";
import {
  buildReportDataset, type Agregacao, type ReportBlocks,
} from "@/services/relatorioContabilService";
import { generateRelatorioContabilDocx } from "@/services/reportRenderers/relatorioContabilDocx";
import { generateRelatorioContabilPdf } from "@/services/reportRenderers/relatorioContabilPdf";
import { toast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3;

const AGREG_LABEL: Record<Agregacao, string> = {
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semester: "Semestral",
  annual: "Anual",
  custom: "Intervalo livre",
};

const REPORT_CATALOG = [
  {
    id: "contabil-dados",
    label: "Relatório Contábil de Dados",
    description: "Composição patrimonial, endividamento detalhado, DRE, indicadores, Kanitz e Score BEx-RJ.",
    enabled: true,
  },
] as const;

export default function RelatoriosContabeis() {
  const { roles } = useUserRoles();
  const [step, setStep] = useState<Step>(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [reportId, setReportId] = useState<string>("contabil-dados");
  const [agregacao, setAgregacao] = useState<Agregacao>("monthly");
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [toKey, setToKey] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ReportBlocks>({
    balanco: true, endividamento: true, dre: true, kanitz: true, scoreRJ: true,
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const isAdmin = roles.includes("gestor_ia") || roles.includes("coordenador");
        const data = isAdmin ? await listCompanies() : await listMyAssignedCompanies();
        if (!cancelled) setCompanies(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roles]);

  const companyNames = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const names = new Set<string>();
    companies.forEach(c => {
      if (!c.name) return;
      if (q && !c.name.toLowerCase().includes(q) && !(c.prospecção_id || "").toLowerCase().includes(q)) return;
      names.add(c.name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [companies, filter]);

  const prospecçãosOfCompany = useMemo(() => {
    if (!companyName) return [];
    return companies.filter(c => c.name === companyName);
  }, [companies, companyName]);

  const selected = companies.find(c => c.id === companyId) || null;

  // Carrega dados financeiros consolidados quando empresa+Prospeccao estão selecionados
  const { parsed, entries, loading: loadingDados } = useConsolidadoBS(companyId, null, null);
  const bsRows = useMemo(() => (parsed ? buildBSDados(parsed, entries) : []), [parsed, entries]);
  const periodKeys = useMemo(
    () => bsRows.map(r => r.mesKey).sort(),
    [bsRows],
  );

  // Defaults de from/to quando os dados chegam
  useEffect(() => {
    if (!periodKeys.length) return;
    if (!fromKey) setFromKey(periodKeys[0]);
    if (!toKey) setToKey(periodKeys[periodKeys.length - 1]);
  }, [periodKeys, fromKey, toKey]);

  const generate = async (formato: "docx" | "pdf") => {
    if (!selected) return;
    if (!bsRows.length) {
      toast({ title: "Sem dados", description: "Esta empresa ainda não possui balancete consolidado.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const dataset = buildReportDataset({
        empresaNome: selected.name,
        empresaCnpj: selected.cnpj,
        prospecçãoId: selected.prospecção_id,
        rows: bsRows,
        fromKey, toKey, agregacao, blocks,
      });
      if (!dataset.periodos.length) {
        toast({ title: "Intervalo vazio", description: "Nenhum período encontrado no intervalo selecionado.", variant: "destructive" });
        return;
      }
      if (formato === "docx") await generateRelatorioContabilDocx(dataset);
      else generateRelatorioContabilPdf(dataset);
      toast({ title: "Relatório gerado", description: `Arquivo .${formato} salvo no seu dispositivo.` });
    } catch (e: any) {
      toast({ title: "Falha ao gerar", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)] flex items-center justify-center">
            <FileBarChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatórios Contábeis</h1>
            <p className="text-sm text-muted-foreground">
              Geração de relatórios analíticos (PDF e DOCX) a partir dos dados consolidados da empresa.
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              step === n ? "bg-[hsl(217,91%,50%)] text-white" :
              step > n ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
            }`}>
              <span className="font-bold">{n}</span>
              <span>{n === 1 ? "Empresa" : n === 2 ? "Prospeccao" : "Configurar"}</span>
            </div>
          ))}
        </div>

        {/* Step 1 — Empresa */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Selecionar Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou Prospeccao AJ..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[500px] overflow-y-auto border rounded-lg divide-y">
                {loading && <div className="p-6 text-center text-sm text-muted-foreground">Carregando empresas...</div>}
                {!loading && companyNames.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>
                )}
                {companyNames.map(name => (
                  <button
                    key={name}
                    onClick={() => { setCompanyName(name); setCompanyId(null); setStep(2); }}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-sm">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {companies.filter(c => c.name === name).length} Prospeccao(s)
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Prospeccao */}
        {step === 2 && companyName && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Prospeccaos de {companyName}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {prospecçãosOfCompany.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setCompanyId(c.id); setStep(3); }}
                    className="text-left p-4 border rounded-lg hover:border-[hsl(217,91%,50%)] hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{c.prospecção_id || "Prospeccao sem identificador"}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        c.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}>{c.status}</span>
                    </div>
                    {c.cnpj && <div className="text-xs text-muted-foreground">CNPJ: {c.cnpj}</div>}
                    {c.last_analyzed_period && (
                      <div className="text-xs text-muted-foreground">Último período: {c.last_analyzed_period}</div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Configurar */}
        {step === 3 && selected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Configurar Relatório</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs">Tipo de Relatório</Label>
                    <div className="mt-2 grid gap-2">
                      {REPORT_CATALOG.map(r => (
                        <button
                          key={r.id}
                          disabled={!r.enabled}
                          onClick={() => setReportId(r.id)}
                          className={`text-left p-3 border rounded-lg transition-colors ${
                            reportId === r.id ? "border-[hsl(217,91%,50%)] bg-blue-50/40" : "hover:border-muted-foreground/40"
                          } ${!r.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <div className="font-semibold text-sm">{r.label}</div>
                          <div className="text-xs text-muted-foreground">{r.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Agregação</Label>
                      <Select value={agregacao} onValueChange={(v) => setAgregacao(v as Agregacao)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(AGREG_LABEL) as Agregacao[]).map(a => (
                            <SelectItem key={a} value={a}>{AGREG_LABEL[a]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Período inicial</Label>
                      <Select value={fromKey || ""} onValueChange={setFromKey} disabled={!periodKeys.length}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {periodKeys.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Período final</Label>
                      <Select value={toKey || ""} onValueChange={setToKey} disabled={!periodKeys.length}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {periodKeys.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Blocos do Relatório</Label>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {([
                        ["balanco", "Balanço Patrimonial"],
                        ["endividamento", "Composição Endividamento"],
                        ["dre", "DRE"],
                        ["kanitz", "Kanitz"],
                        ["scoreRJ", "Score BEx-RJ"],
                      ] as Array<[keyof ReportBlocks, string]>).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            checked={blocks[k]}
                            onCheckedChange={(v) => setBlocks(prev => ({ ...prev, [k]: !!v }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Gerar</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => generate("docx")}
                    disabled={generating || loadingDados || !bsRows.length}
                    className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
                  >
                    <FileType2 className="w-4 h-4 mr-2" /> Baixar DOCX
                  </Button>
                  <Button
                    onClick={() => generate("pdf")}
                    disabled={generating || loadingDados || !bsRows.length}
                    variant="outline"
                  >
                    <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                  </Button>
                  {loadingDados && <span className="text-xs text-muted-foreground self-center">Carregando dados consolidados…</span>}
                  {!loadingDados && !bsRows.length && (
                    <span className="text-xs text-amber-700 self-center">
                      Esta empresa ainda não possui balancete consolidado. Processe os arquivos no Workspace antes de gerar.
                    </span>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Side summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo da seleção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><b>Empresa:</b> {selected.name}</div>
                {selected.cnpj && <div><b>CNPJ:</b> {selected.cnpj}</div>}
                <div><b>Prospeccao AJ:</b> {selected.prospecção_id || "—"}</div>
                <div><b>Agregação:</b> {AGREG_LABEL[agregacao]}</div>
                <div><b>Períodos disponíveis:</b> {periodKeys.length}</div>
                <div><b>Intervalo:</b> {fromKey || "—"} → {toKey || "—"}</div>
                <div className="pt-2 border-t mt-2 text-xs text-muted-foreground">
                  Outros relatórios poderão ser adicionados aqui (Auditoria, Fluxo de Caixa, Cross-Validation, etc.).
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}
