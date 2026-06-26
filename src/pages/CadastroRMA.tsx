import { invokeAuthed } from "@/lib/invokeAuthed";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, ListChecks, Check, Search, CheckCircle2, UserCheck, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import PlatformLayout from "@/components/PlatformLayout";
import { RMA_TOPICS } from "@/data/rmaTopics";
import { createCompany, assignCompanyToConsultant } from "@/services/companiesService";
import { supabase } from "@/integrations/supabase/client";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const formatCNPJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  let o = d;
  if (d.length > 2) o = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) o = o.slice(0, 6) + "." + o.slice(6);
  if (d.length > 8) o = o.slice(0, 10) + "/" + o.slice(10);
  if (d.length > 12) o = o.slice(0, 15) + "-" + o.slice(15);
  return o;
};

type Consultor = { user_id: string; full_name: string; email: string; role: string; active: boolean };

const CadastroRMA = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Empresa
  const [rmaName, setRmaName] = useState("");
  const [rmaId, setRmaId] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");

  // Configuração de execução mensal automática
  const currentYear = new Date().getFullYear();
  const [autoMonthly, setAutoMonthly] = useState(true);
  const [executionYear, setExecutionYear] = useState<number>(currentYear);
  const [executionMonth, setExecutionMonth] = useState<number | null>(null);
  const [periodActive, setPeriodActive] = useState(true);

  // Tópicos
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [topicSearch, setTopicSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Todos");

  // Consultor (etapa 3)
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [loadingConsultores, setLoadingConsultores] = useState(false);
  const [selectedConsultor, setSelectedConsultor] = useState<string>("");

  const categories = useMemo(() => {
    const set = new Set(RMA_TOPICS.map(t => t.category));
    return ["Todos", ...Array.from(set).sort()];
  }, []);

  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    return RMA_TOPICS.filter(t =>
      (activeCategory === "Todos" || t.category === activeCategory) &&
      (!q || t.name.toLowerCase().includes(q) || String(t.number).includes(q))
    );
  }, [topicSearch, activeCategory]);

  const toggleTopic = (n: number) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };
  const selectAll = () => setSelectedTopics(new Set(RMA_TOPICS.map(t => t.number)));
  const clearAll = () => setSelectedTopics(new Set());
  const selectFiltered = () => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      filteredTopics.forEach(t => next.add(t.number));
      return next;
    });
  };

  // Carrega consultores ao entrar na etapa 3
  useEffect(() => {
    if (step !== 3 || consultores.length > 0) return;
    setLoadingConsultores(true);
    supabase.functions
      .invoke("admin-create-user", { body: { action: "list" } })
      .then(({ data }) => {
        const all = ((data as any)?.profiles || []) as Consultor[];
        setConsultores(all.filter(p => p.role === "consultor" && p.active));
      })
      .catch(() => toast({ title: "Erro ao carregar consultores", variant: "destructive" }))
      .finally(() => setLoadingConsultores(false));
  }, [step]);

  // Garante que o mês de referência sempre coincide com o número do ID RMA (001–012)
  const rmaIdNumber = useMemo(() => {
    const m = rmaId.match(/^RMA-(\d{3})$/);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= 12 ? n : null;
  }, [rmaId]);

  useEffect(() => {
    if (rmaIdNumber && executionMonth !== rmaIdNumber) {
      setExecutionMonth(rmaIdNumber);
    }
  }, [rmaIdNumber, executionMonth]);

  const handleNext = () => {
    if (!rmaName.trim()) {
      toast({ title: "Nome RMA é obrigatório", variant: "destructive" });
      return;
    }
    if (!rmaId.trim() || !rmaIdNumber) {
      toast({
        title: "ID RMA inválido",
        description: "Selecione um ID RMA entre RMA-001 e RMA-012.",
        variant: "destructive",
      });
      return;
    }
    if (cnpj && cnpj.replace(/\D/g, "").length !== 14) {
      toast({ title: "CNPJ inválido", description: "Informe 14 dígitos", variant: "destructive" });
      return;
    }
    if (!executionMonth || executionMonth !== rmaIdNumber) {
      toast({
        title: "Mês de referência divergente",
        description: "O mês deve coincidir com o número do ID RMA (001–012).",
        variant: "destructive",
      });
      setExecutionMonth(rmaIdNumber);
      return;
    }
    setStep(2);
  };

  const handleNextToValidation = () => {
    if (selectedTopics.size === 0) {
      toast({ title: "Selecione ao menos 1 tópico do RMA", variant: "destructive" });
      return;
    }
    setStep(3);
  };

  const handleSave = async () => {
    if (!selectedConsultor) {
      toast({ title: "Selecione o Consultor responsável", variant: "destructive" });
      return;
    }
    if (!rmaIdNumber || executionMonth !== rmaIdNumber) {
      toast({
        title: "Mês de referência divergente",
        description: "O mês deve coincidir com o número do ID RMA (001–012). Volte à etapa 1 e revise.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const topics = RMA_TOPICS
        .filter(t => selectedTopics.has(t.number))
        .map(t => ({ number: t.number, name: t.name }));
      const company = await createCompany(
        {
          name: rmaName,
          rma_id: rmaId,
          cnpj,
          uf,
          city,
          auto_monthly: autoMonthly,
          execution_year: executionYear,
          period_active: periodActive,
          current_period_month: executionMonth,
        },
        topics
      );
      await assignCompanyToConsultant(company.id, selectedConsultor);
      toast({
        title: "RMA cadastrado e atribuído",
        description: `${selectedTopics.size} tópico(s) vinculados. Aguardando ativação pelo consultor.`,
      });
      navigate("/dashboard");
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stepLabel = step === 1
    ? "Etapa 1 de 3 — Dados da empresa"
    : step === 2
    ? "Etapa 2 de 3 — Seleção de tópicos do RMA"
    : "Etapa 3 de 3 — Validação e atribuição do Consultor";

  const consultorSelecionado = consultores.find(c => c.user_id === selectedConsultor);

  return (
    <PlatformLayout>
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => step === 1 ? navigate(-1) : setStep((step - 1) as 1 | 2)}
            className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white flex items-center justify-center transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cadastro RMA</h1>
            <p className="text-sm text-muted-foreground">{stepLabel}</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${step === 1 ? "bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)]" : "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)]"}`}>
            {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            <span className="text-sm font-medium">Empresa</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            step === 2
              ? "bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)]"
              : step > 2
              ? "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)]"
              : "bg-muted text-muted-foreground"
          }`}>
            {step > 2 ? <CheckCircle2 className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
            <span className="text-sm font-medium">Tópicos RMA</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${step === 3 ? "bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)]" : "bg-muted text-muted-foreground"}`}>
            <ShieldCheck className="w-4 h-4" />
            <span className="text-sm font-medium">Validação</span>
          </div>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados da Empresa (Recuperanda)</CardTitle>
              <CardDescription>O Coordenador registra o ID RMA que vincula o RMA Empresa na plataforma e ao Consultor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Nome RMA * <span className="text-xs text-muted-foreground font-normal">(nome da empresa)</span></Label>
                  <Input
                    value={rmaName}
                    onChange={(e) => setRmaName(e.target.value.toUpperCase())}
                    maxLength={200}
                    placeholder="Ex: DIPLOMATA"
                  />
                </div>
                <div>
                  <Label>ID RMA * <span className="text-xs text-muted-foreground font-normal">(número = mês de referência)</span></Label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 h-10 inline-flex items-center rounded-md border border-input bg-muted text-sm font-mono text-foreground">RMA-</span>
                    <Select
                      value={rmaId.startsWith("RMA-") ? rmaId.slice(4) : ""}
                      onValueChange={(v) => {
                        setRmaId(`RMA-${v}`);
                        setExecutionMonth(Number(v));
                      }}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione 001 a 012" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(3, "0")).map((n) => {
                          const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
                          return (
                            <SelectItem key={n} value={n}>RMA-{n} — {meses[Number(n) - 1]}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label>UF</Label>
                  <Select value={uf} onValueChange={setUf}>
                    <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
              </div>

              {/* Configuração de execução automática mensal */}
              <div className="rounded-lg border border-[hsl(217,91%,50%)]/20 bg-[hsl(217,91%,50%)]/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                  <Label className="text-sm font-semibold text-foreground">
                    Execução automática mensal do RMA
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  A plataforma abre o RMA no dia 1º do mês e encerra no último dia (28/29/30/31).
                  A leitura no OneDrive ocorre na pasta{" "}
                  <span className="font-mono">
                    Projeto RMA/{rmaName || "Empresa"}/{executionYear}/
                    {executionMonth ? `${String(executionMonth).padStart(2, "0")}.${executionYear}` : "MM.AAAA"}/
                  </span>
                  {" "}— cada subpasta é um tópico, classificado como{" "}
                  <span className="font-semibold text-[hsl(142,76%,36%)]">Completo</span>,{" "}
                  <span className="font-semibold text-[hsl(38,92%,50%)]">Incompleto</span> ou{" "}
                  <span className="font-semibold text-[hsl(0,84%,60%)]">Pendente</span>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="flex items-start gap-2 p-3 rounded-md border border-border bg-card cursor-pointer">
                    <Checkbox
                      checked={autoMonthly}
                      onCheckedChange={(c) => setAutoMonthly(!!c)}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Leitura automática mensal</p>
                      <p className="text-muted-foreground">Reinicia a análise todo mês</p>
                    </div>
                  </label>
                  <div>
                    <Label className="text-xs">Ano de execução</Label>
                    <Select
                      value={String(executionYear)}
                      onValueChange={(v) => setExecutionYear(Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Mês de referência</Label>
                    <div className={`h-10 px-3 inline-flex items-center w-full rounded-md border bg-muted text-sm font-mono ${!executionMonth ? "border-[hsl(0,84%,60%)] text-muted-foreground" : "border-input text-foreground"}`}>
                      {executionMonth
                        ? `${String(executionMonth).padStart(2, "0")}.${executionYear} — ${["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][executionMonth - 1]}`
                        : "Definido pelo ID RMA"}
                    </div>
                  </div>
                  <label className="flex items-start gap-2 p-3 rounded-md border border-border bg-card cursor-pointer">
                    <Checkbox
                      checked={periodActive}
                      onCheckedChange={(c) => setPeriodActive(!!c)}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Período ativo</p>
                      <p className="text-muted-foreground">
                        Inicia em {executionMonth ? `${String(executionMonth).padStart(2, "0")}.${executionYear}` : "MM.AAAA"}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleNext} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-2">
                  Próximo: Selecionar Tópicos <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Tópicos do RMA</CardTitle>
                  <CardDescription>
                    Selecione os tópicos que farão parte do RMA desta empresa. Você pode escolher quantos quiser.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/30">
                    {selectedTopics.size} de {RMA_TOPICS.length} selecionados
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Buscar tópico por nome ou número..."
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectFiltered}>Selecionar visíveis</Button>
                  <Button variant="outline" size="sm" onClick={selectAll}>Selecionar todos</Button>
                  <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      activeCategory === c
                        ? "bg-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)] text-white"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
                {filteredTopics.map(t => {
                  const checked = selectedTopics.has(t.number);
                  return (
                    <label
                      key={t.number}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        checked
                          ? "bg-[hsl(217,91%,50%)]/5 border-[hsl(217,91%,50%)]/40"
                          : "bg-card border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleTopic(t.number)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-muted-foreground">#{t.number}</span>
                          <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground leading-snug">{t.name}</p>
                      </div>
                      {checked && <Check className="w-4 h-4 text-[hsl(217,91%,50%)] shrink-0" />}
                    </label>
                  );
                })}
                {filteredTopics.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground text-center py-8">
                    Nenhum tópico encontrado
                  </p>
                )}
              </div>

              <div className="flex justify-between pt-2 border-t border-border/50">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </Button>
                <Button
                  onClick={handleNextToValidation}
                  disabled={selectedTopics.size === 0}
                  className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-2"
                >
                  Próximo: Validação <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {/* Resumo dos dados */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                  Validação do RMA Empresa
                </CardTitle>
                <CardDescription>
                  Revise os dados antes de concluir e atribua o Consultor responsável pela operação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 rounded-lg bg-[hsl(217,91%,50%)]/5 border border-[hsl(217,91%,50%)]/20">
                    <div className="flex items-center gap-2 mb-2 text-[hsl(217,91%,50%)]">
                      <Building2 className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Empresa</span>
                    </div>
                    <p className="text-sm font-bold text-foreground truncate">{rmaName}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rmaId || "—"} • {cnpj || "Sem CNPJ"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {city || "—"}{uf ? `/${uf}` : ""}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-[hsl(258,90%,66%)]/5 border border-[hsl(258,90%,66%)]/20">
                    <div className="flex items-center gap-2 mb-2 text-[hsl(258,90%,66%)]">
                      <ListChecks className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Tópicos RMA</span>
                    </div>
                    <p className="text-3xl font-bold text-foreground leading-none">
                      {selectedTopics.size}
                      <span className="text-base font-normal text-muted-foreground"> / {RMA_TOPICS.length}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">tópicos atribuídos</p>
                  </div>

                  <div className="p-4 rounded-lg bg-[hsl(38,92%,50%)]/5 border border-[hsl(38,92%,50%)]/20">
                    <div className="flex items-center gap-2 mb-2 text-[hsl(38,92%,50%)]">
                      <UserCheck className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Status</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">Aguardando ativação</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      O consultor atribuído deverá ativar o RMA para iniciar a análise da IA.
                    </p>
                  </div>
                </div>

                {/* Lista de tópicos */}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tópicos selecionados</Label>
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg p-3 flex flex-wrap gap-1.5">
                    {RMA_TOPICS.filter(t => selectedTopics.has(t.number)).map(t => (
                      <Badge key={t.number} variant="outline" className="text-[10px] font-normal">
                        #{t.number} {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Seleção do consultor */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                  Consultor Responsável
                </CardTitle>
                <CardDescription>
                  Selecione o consultor que receberá este RMA na plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingConsultores ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Carregando consultores...</p>
                ) : consultores.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum consultor ativo encontrado. Cadastre um consultor antes de atribuir o RMA.
                  </p>
                ) : (
                  <Select value={selectedConsultor} onValueChange={setSelectedConsultor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o consultor responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {consultores.map(c => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.full_name} — {c.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {consultorSelecionado && (
                  <div className="p-3 rounded-lg bg-[hsl(142,76%,36%)]/5 border border-[hsl(142,76%,36%)]/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(142,76%,36%)] text-white flex items-center justify-center font-bold">
                      {consultorSelecionado.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{consultorSelecionado.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{consultorSelecionado.email}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-[hsl(142,76%,36%)] ml-auto shrink-0" />
                  </div>
                )}

                <div className="flex justify-between pt-2 border-t border-border/50">
                  <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !selectedConsultor}
                    className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {saving ? "Concluindo..." : "Concluir cadastro do RMA"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PlatformLayout>
  );
};

export default CadastroRMA;
