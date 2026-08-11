import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Bot, Plus, Folder, FileText, Brain, Cpu, Trash2, Edit,
  CheckCircle2, Pause, XCircle, Layers, Wand2, ListChecks, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { PROMPT_BASE, AGENT_TEMPLATES, buildFullPrompt } from "@/lib/agentPrompts";
import { PIPELINE_STAGES, PIPELINE_CONFIG, EXTRACTOR_VARIANTS } from "@/lib/agentPipeline";
import { ARCH_BLOCKS, ARCH_FLOW_NODES } from "@/lib/agentArchitecture";
import { Copy, ArrowRight, ShieldAlert, Search, Filter, FileSearch, Sparkles, Network, Cloud, Database as DbIcon, Workflow, GraduationCap } from "lucide-react";

type SubAgent = { nome: string; tipo: string };
type Rule = { if_contains: string[]; class: string };
type Agent = {
  id: string;
  name: string;
  description: string | null;
  folder_path: string;
  accepted_types: string[];
  ocr_engine: string;
  ai_model: string;
  temperature: number;
  sub_agents: SubAgent[];
  classification_rules: Rule[];
  system_prompt: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const OCR_ENGINES = [
  { value: "tesseract", label: "Tesseract (rápido)" },
  { value: "azure_ocr", label: "Azure OCR (alta precisão)" },
  { value: "google_vision", label: "Google Vision" },
  { value: "hybrid", label: "Híbrido (Tesseract + LLM)" },
];

const AI_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  active:   { label: "Ativo",   cls: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]", icon: CheckCircle2 },
  paused:   { label: "Pausado", cls: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]",  icon: Pause },
  inactive: { label: "Inativo", cls: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]",    icon: XCircle },
};

const emptyAgent = (): Partial<Agent> => ({
  name: "",
  description: "",
  folder_path: "/Financeiro/",
  accepted_types: ["pdf"],
  ocr_engine: "google_vision",
  ai_model: "google/gemini-3-flash-preview",
  temperature: 0.1,
  sub_agents: [],
  classification_rules: [],
  system_prompt: "",
  status: "active",
});

export default function GestaoAgentesOCR() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ocr_agents")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar agentes: " + error.message);
    } else {
      setAgents((data || []) as any);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(emptyAgent()); setOpen(true); };
  const openEdit = (a: Agent) => { setEditing({ ...a }); setOpen(true); };

  const save = async () => {
    if (!editing?.name || !editing.folder_path) {
      toast.error("Nome e pasta são obrigatórios");
      return;
    }
    const payload = {
      name: editing.name,
      description: editing.description || null,
      folder_path: editing.folder_path,
      accepted_types: editing.accepted_types || [],
      ocr_engine: editing.ocr_engine || "google_vision",
      ai_model: editing.ai_model || "google/gemini-3-flash-preview",
      temperature: editing.temperature ?? 0.3,
      sub_agents: editing.sub_agents || [],
      classification_rules: editing.classification_rules || [],
      system_prompt: editing.system_prompt || null,
      status: editing.status || "active",
    };
    const op = editing.id
      ? supabase.from("ocr_agents").update(payload).eq("id", editing.id)
      : supabase.from("ocr_agents").insert(payload);
    const { error } = await op;
    if (error) toast.error(error.message);
    else {
      toast.success(editing.id ? "Agente atualizado" : "Agente criado");
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este agente?")) return;
    const { error } = await supabase.from("ocr_agents").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Agente removido"); load(); }
  };

  const toggleStatus = async (a: Agent) => {
    const next = a.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("ocr_agents").update({ status: next }).eq("id", a.id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/gestor-ia")}
              className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] flex items-center justify-center transition-colors"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-bold font-serif text-foreground">Gestão de Agentes OCR</h1>
              <p className="text-sm text-muted-foreground">
                Modelo híbrido: cada pasta do OneDrive ativa um agente especializado com sub-agentes por tipo de documento.
              </p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-1.5 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]">
            <Plus className="w-4 h-4" /> Novo Agente
          </Button>
        </div>

        <Tabs defaultValue="agentes" className="mb-6">
          <TabsList>
            <TabsTrigger value="agentes" className="gap-1.5"><Bot className="w-4 h-4" /> Agentes</TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1.5"><Activity className="w-4 h-4" /> Pipeline de Produção</TabsTrigger>
            <TabsTrigger value="arquitetura" className="gap-1.5"><Network className="w-4 h-4" /> Arquitetura MASTER</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4 space-y-4">
            {/* Pipeline diagram */}
            <div className="bg-card rounded-xl border border-border p-4 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max">
                {[
                  { l: "OCR", icon: FileText },
                  { l: "Classificador", icon: Filter },
                  { l: "Extrator Esp.", icon: FileSearch },
                  { l: "Validador", icon: CheckCircle2 },
                  { l: "Analista", icon: Sparkles },
                  { l: "Antifraude", icon: ShieldAlert },
                  { l: "JSON Final + Score", icon: Brain },
                ].map((s, i, arr) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="px-3 py-2 rounded-md bg-[hsl(222,47%,14%)] text-white text-xs font-semibold inline-flex items-center gap-1.5">
                      <s.icon className="w-3.5 h-3.5" /> {s.l}
                    </div>
                    {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Fallback: <code className="font-mono">{PIPELINE_CONFIG.fallback.rule}</code> → {PIPELINE_CONFIG.fallback.actions.join(" / ")}.
                Score final = <code className="font-mono">{PIPELINE_CONFIG.score_final.formula}</code>.
              </p>
            </div>

            {/* Stages cards */}
            <div className="grid gap-3">
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[hsl(217,91%,50%)] text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {stage.order}
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{stage.label}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="outline" className="text-[10px]">temp recomendada: {stage.recommendedTemp.toFixed(1)}</Badge>
                          {stage.outputSchema.map((f) => (
                            <Badge key={f} variant="secondary" className="text-[10px] font-mono">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="sm" className="gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(stage.prompt);
                          toast.success(`Prompt ${stage.id} copiado`);
                        }}
                      ><Copy className="w-3.5 h-3.5" /> Copiar</Button>
                      <Button
                        variant="outline" size="sm" className="gap-1"
                        onClick={() => {
                          setEditing({
                            ...emptyAgent(),
                            name: `AGENTE_${stage.id}`,
                            description: stage.description,
                            system_prompt: stage.prompt,
                            temperature: stage.recommendedTemp,
                            folder_path: "/Pipeline/" + stage.id,
                          });
                          setOpen(true);
                        }}
                      ><Plus className="w-3.5 h-3.5" /> Criar agente deste estágio</Button>
                    </div>
                  </div>
                  <pre className="text-[11px] leading-snug bg-muted/40 rounded-md p-3 max-h-48 overflow-y-auto font-mono whitespace-pre-wrap text-muted-foreground">
{stage.prompt}
                  </pre>
                </div>
              ))}
            </div>

            {/* Extractor variants (few-shot per class) */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="font-bold text-foreground flex items-center gap-1.5 mb-1">
                <FileSearch className="w-4 h-4" /> Variantes do Extrator (few-shot por classe)
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Após o Classificador retornar a classe, despache para o extrator correspondente.
              </p>
              <div className="grid md:grid-cols-3 gap-3">
                {Object.entries(EXTRACTOR_VARIANTS).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border p-3 bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className="bg-[hsl(217,91%,50%)] text-[10px]">{k}</Badge>
                      <Button
                        variant="ghost" size="sm" className="h-6 px-2 gap-1 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(v.prompt);
                          toast.success(`Prompt ${k} copiado`);
                        }}
                      ><Copy className="w-3 h-3" /> Copiar</Button>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{v.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{v.prompt.split("\n").slice(0, 3).join(" ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="agentes" className="mt-4">
            {/* Concept cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {[
                { icon: Layers, title: "Agente por Pasta", desc: "Nível 1: cada pasta do OneDrive ativa um agente dedicado." },
                { icon: Bot, title: "Sub-agentes por Tipo", desc: "Nível 2: especialização por documento (PIX, balancete, boleto…)." },
                { icon: Wand2, title: "Pipeline OCR + IA", desc: "OCR base → regex → classificação → extração estruturada." },
              ].map((c, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
                    <c.icon className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{c.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="arquitetura" className="mt-4 space-y-4">
            {/* Header / objetivo */}
            <div className="bg-gradient-to-br from-[hsl(222,47%,14%)] to-[hsl(217,91%,25%)] text-white rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">MD MASTER — Arquitetura Completa</h3>
                  <p className="text-xs text-white/80 mt-1 max-w-3xl">
                    Plataforma multi-cloud (Google Drive + OneDrive) com OCR + IA, agentes especializados por pasta,
                    aprospecçãozenamento estruturado + embeddings, e evolução via dataset próprio + learning loop.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[
                      { icon: Cloud, label: "Multi-cloud (GDrive + OneDrive)" },
                      { icon: Workflow, label: "Pipeline de 5 estágios" },
                      { icon: DbIcon, label: "Postgres + pgvector" },
                      { icon: GraduationCap, label: "Learning loop evolutivo" },
                    ].map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[11px]">
                        <f.icon className="w-3 h-3" /> {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Master flow */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h4 className="font-bold text-foreground flex items-center gap-1.5 mb-3">
                <Workflow className="w-4 h-4" /> Fluxo ponta-a-ponta
              </h4>
              <div className="overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max pb-2">
                  {ARCH_FLOW_NODES.map((n, i) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <div className="px-3 py-2 rounded-lg bg-[hsl(222,47%,14%)] text-white text-[11px] font-medium whitespace-nowrap">
                        {n.label}
                      </div>
                      {i < ARCH_FLOW_NODES.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Ingestão → fila → OCR → classificação → agentes → validação → análise → antifraude → storage → API → dashboard.
              </p>
            </div>

            {/* Phase blocks */}
            {ARCH_BLOCKS.map((block) => (
              <div key={block.key} className="bg-card rounded-xl border border-border p-4">
                <h4 className="font-bold text-foreground mb-3">{block.label}</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {block.phases.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border p-3 bg-muted/20"
                      style={{ borderLeft: `3px solid ${p.color}` }}
                    >
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-mono">{p.md}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{p.phase}</Badge>
                        </div>
                        {p.endpoint && (
                          <Button
                            variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[10px]"
                            onClick={() => {
                              navigator.clipboard.writeText(p.endpoint!);
                              toast.success("Endpoint copiado");
                            }}
                          ><Copy className="w-3 h-3" /> Copiar endpoint</Button>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.goal}</p>
                      {p.endpoint && (
                        <code className="block mt-2 text-[11px] font-mono bg-background/60 px-2 py-1 rounded text-foreground">
                          {p.endpoint}
                        </code>
                      )}
                      {p.payload && (
                        <pre className="mt-2 text-[10px] leading-snug font-mono bg-background/60 rounded p-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
{p.payload}
                        </pre>
                      )}
                      {p.notes && p.notes.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {p.notes.map((n, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                              <span className="text-[hsl(217,91%,50%)]">•</span> {n}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Status implementation */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h4 className="font-bold text-foreground flex items-center gap-1.5 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[hsl(152,70%,45%)]" /> Status na plataforma
              </h4>
              <div className="grid md:grid-cols-3 gap-2 text-xs">
                {[
                  { label: "OneDrive (MS Graph)", status: "ok", note: "Conector ativo, base /Projeto Prospeccao" },
                  { label: "Google Drive", status: "todo", note: "Conector disponível, ingest a habilitar" },
                  { label: "Filas / Workers", status: "partial", note: "Edge functions assíncronas (BEx Cloud)" },
                  { label: "OCR Worker", status: "partial", note: "audit-parse-pdf + pipeline-search" },
                  { label: "Classificador + Agentes", status: "ok", note: "agent_pipeline + ocr_agents" },
                  { label: "Validador / Análise / Antifraude", status: "ok", note: "5 estágios definidos" },
                  { label: "Postgres + pgvector", status: "ok", note: "pipeline_documents + document_embeddings" },
                  { label: "API Layer", status: "ok", note: "Edge functions REST" },
                  { label: "Dashboard", status: "ok", note: "Gestor IA + Prospeccao Workspace" },
                  { label: "Dataset / Treino", status: "todo", note: "Fase 12 — sintético + ground truth" },
                  { label: "Learning Loop", status: "todo", note: "Correção humana → re-prompt" },
                ].map((row, i) => {
                  const c = row.status === "ok" ? "hsl(152,70%,45%)" : row.status === "partial" ? "hsl(38,90%,55%)" : "hsl(0,70%,55%)";
                  const lbl = row.status === "ok" ? "Implementado" : row.status === "partial" ? "Parcial" : "Pendente";
                  return (
                    <div key={i} className="rounded-lg border border-border p-2.5 bg-muted/20">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-foreground text-[12px]">{row.label}</span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${c}1a`, color: c }}
                        >{lbl}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{row.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Agents list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando agentes…</div>
        ) : agents.length === 0 ? (
          <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center">
            <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum agente cadastrado ainda.</p>
            <Button onClick={openNew} className="mt-4 gap-1.5 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]">
              <Plus className="w-4 h-4" /> Criar primeiro agente
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {agents.map((a) => {
              const sb = STATUS_BADGE[a.status] || STATUS_BADGE.active;
              const SbIcon = sb.icon;
              return (
                <div key={a.id} className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-lg bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-foreground">{a.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${sb.cls}`}>
                            <SbIcon className="w-3 h-3" /> {sb.label}
                          </span>
                        </div>
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{a.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1"><Folder className="w-3.5 h-3.5" /> {a.folder_path}</span>
                          <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {a.accepted_types.join(", ")}</span>
                          <span className="inline-flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {a.ocr_engine}</span>
                          <span className="inline-flex items-center gap-1"><Brain className="w-3.5 h-3.5" /> {a.ai_model} · t={Number(a.temperature).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(a)} className="gap-1">
                        {a.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Ativar</>}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(0,70%,55%)]" onClick={() => remove(a.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 mt-3">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> Sub-agentes ({a.sub_agents?.length || 0})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(a.sub_agents || []).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {s.nome}{s.tipo ? ` · ${s.tipo}` : ""}
                          </Badge>
                        ))}
                        {(!a.sub_agents || a.sub_agents.length === 0) && (
                          <span className="text-xs text-muted-foreground italic">Nenhum sub-agente configurado</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5" /> Regras de classificação ({a.classification_rules?.length || 0})
                      </div>
                      <div className="space-y-1">
                        {(a.classification_rules || []).slice(0, 3).map((r, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            <span className="font-mono text-[hsl(217,91%,50%)]">{r.class}</span>
                            {" ← "}
                            {r.if_contains?.slice(0, 3).join(" / ")}
                          </div>
                        ))}
                        {(!a.classification_rules || a.classification_rules.length === 0) && (
                          <span className="text-xs text-muted-foreground italic">Nenhuma regra configurada</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Agente OCR" : "Novo Agente OCR"}</DialogTitle>
            <DialogDescription>
              Configure pasta, motor OCR, modelo de IA, sub-agentes e regras de classificação.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <Tabs defaultValue="basic" className="mt-2">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="basic">Básico</TabsTrigger>
                <TabsTrigger value="ai">OCR & IA</TabsTrigger>
                <TabsTrigger value="sub">Sub-agentes</TabsTrigger>
                <TabsTrigger value="rules">Classificação</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div>
                  <Label>Nome do agente *</Label>
                  <Input
                    value={editing.name || ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="AGENTE_FINANCEIRO_TRANSACIONAL"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={editing.description || ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="O que este agente faz, quais documentos lê e o que extrai…"
                    rows={3}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Pasta OneDrive *</Label>
                    <Input
                      value={editing.folder_path || ""}
                      onChange={(e) => setEditing({ ...editing, folder_path: e.target.value })}
                      placeholder="/Financeiro/Transacoes"
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={editing.status || "active"}
                      onValueChange={(v) => setEditing({ ...editing, status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="paused">Pausado</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Tipos aceitos (separados por vírgula)</Label>
                  <Input
                    value={(editing.accepted_types || []).join(", ")}
                    onChange={(e) => setEditing({
                      ...editing,
                      accepted_types: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="pdf, png, jpg, xlsx"
                  />
                </div>
              </TabsContent>

              <TabsContent value="ai" className="space-y-4 mt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Motor OCR</Label>
                    <Select
                      value={editing.ocr_engine || "google_vision"}
                      onValueChange={(v) => setEditing({ ...editing, ocr_engine: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OCR_ENGINES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modelo de IA</Label>
                    <Select
                      value={editing.ai_model || "google/gemini-3-flash-preview"}
                      onValueChange={(v) => setEditing({ ...editing, ai_model: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Temperatura ({Number(editing.temperature ?? 0.3).toFixed(2)})</Label>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={editing.temperature ?? 0.3}
                    onChange={(e) => setEditing({ ...editing, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Prompt Base (herdado por todos os agentes)
                    </Label>
                    <Badge variant="outline" className="text-[10px]">somente leitura</Badge>
                  </div>
                  <pre className="text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
{PROMPT_BASE}
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>Prompt específico do agente</Label>
                    <Select onValueChange={(v) => {
                      const tpl = AGENT_TEMPLATES[v];
                      if (tpl) setEditing({ ...editing, system_prompt: tpl.specific });
                    }}>
                      <SelectTrigger className="h-8 w-[280px] text-xs">
                        <SelectValue placeholder="Aplicar template MD…" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AGENT_TEMPLATES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    value={editing.system_prompt || ""}
                    onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })}
                    rows={10}
                    className="font-mono text-xs"
                    placeholder="Você é um especialista em…  (será concatenado ao Prompt Base no momento da execução)"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Em runtime: <code className="font-mono">PROMPT_BASE + "---" + PROMPT_ESPECIFICO</code> ({(editing.system_prompt || "").length} chars).
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="sub" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Sub-agentes especializados por tipo de documento dentro da pasta.
                </p>
                {(editing.sub_agents || []).map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      value={s.nome}
                      onChange={(e) => {
                        const arr = [...(editing.sub_agents || [])];
                        arr[i] = { ...arr[i], nome: e.target.value };
                        setEditing({ ...editing, sub_agents: arr });
                      }}
                      placeholder="Nome (ex: OCR_PIX)"
                    />
                    <Input
                      value={s.tipo}
                      onChange={(e) => {
                        const arr = [...(editing.sub_agents || [])];
                        arr[i] = { ...arr[i], tipo: e.target.value };
                        setEditing({ ...editing, sub_agents: arr });
                      }}
                      placeholder="Tipo / função"
                    />
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setEditing({
                        ...editing,
                        sub_agents: (editing.sub_agents || []).filter((_, j) => j !== i),
                      })}
                    ><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setEditing({
                    ...editing,
                    sub_agents: [...(editing.sub_agents || []), { nome: "", tipo: "" }],
                  })}
                  className="gap-1"
                ><Plus className="w-3.5 h-3.5" /> Adicionar sub-agente</Button>
              </TabsContent>

              <TabsContent value="rules" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Regras híbridas regex + IA: se o texto contém qualquer um dos termos, classifica como o tipo informado.
                </p>
                {(editing.classification_rules || []).map((r, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-2">
                    <Input
                      value={r.if_contains?.join(", ") || ""}
                      onChange={(e) => {
                        const arr = [...(editing.classification_rules || [])];
                        arr[i] = { ...arr[i], if_contains: e.target.value.split(",").map(s => s.trim()).filter(Boolean) };
                        setEditing({ ...editing, classification_rules: arr });
                      }}
                      placeholder="pix realizado, id da transação"
                    />
                    <Input
                      value={r.class}
                      onChange={(e) => {
                        const arr = [...(editing.classification_rules || [])];
                        arr[i] = { ...arr[i], class: e.target.value };
                        setEditing({ ...editing, classification_rules: arr });
                      }}
                      placeholder="PIX"
                    />
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setEditing({
                        ...editing,
                        classification_rules: (editing.classification_rules || []).filter((_, j) => j !== i),
                      })}
                    ><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setEditing({
                    ...editing,
                    classification_rules: [...(editing.classification_rules || []), { if_contains: [], class: "" }],
                  })}
                  className="gap-1"
                ><Plus className="w-3.5 h-3.5" /> Adicionar regra</Button>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]">
              {editing?.id ? "Salvar alterações" : "Criar agente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
}
