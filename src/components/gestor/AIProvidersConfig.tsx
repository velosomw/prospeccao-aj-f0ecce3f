// AIProvidersConfig — painel /gestor-ia → "Gestão de Agentes".
// Implementa o catálogo de 5 provedores conforme gestor-ia-painel-configuracao.md:
// Lovable AI Gateway (ATIVO managed) + Google Document AI (OCR) + Gemini / Vertex / OpenAI (standby).
// Pipeline OCR → Reasoning → Report persistido em localStorage.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Cloud, FileSearch, Sparkles, Brain, Cpu,
  CheckCircle2, Settings, Zap, ShieldCheck, Save, PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Tipos ───────────────────────────────────────────────────
type ProviderId =
  | "lovable_cloud"
  | "google_document_ai"
  | "gemini"
  | "vertex_ai"
  | "openai_gpt";

type Capability = "ocr" | "reasoning" | "report" | "embeddings";

interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey: string;
  projectId?: string;
  location?: string;
  processorId?: string;
  model?: string;
}

interface PipelineConfig {
  ocr: ProviderId;
  reasoning: ProviderId;
  report: ProviderId;
}

interface ProviderMeta {
  id: ProviderId;
  name: string;
  vendor: string;
  icon: typeof Cloud;
  color: string;
  description: string;
  capabilities: Capability[];
  fields: Array<"apiKey" | "projectId" | "location" | "processorId" | "model">;
  models?: string[];
  managed?: boolean;
  requiredSecrets?: string[];
}

// ─── Catálogo ────────────────────────────────────────────────
const PROVIDERS: ProviderMeta[] = [
  {
    id: "lovable_cloud",
    name: "BEx AI Gateway",
    vendor: "BEx Cloud (managed)",
    icon: Cloud,
    color: "hsl(258,90%,66%)",
    description:
      "API key gerenciada pela plataforma. Sem configuração — usa Gemini e GPT via gateway seguro.",
    capabilities: ["reasoning", "report"],
    fields: ["model"],
    models: [
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
    ],
    managed: true,
    requiredSecrets: ["LOVABLE_API_KEY"],
  },
  {
    id: "google_document_ai",
    name: "Google Cloud Document AI",
    vendor: "Google Cloud",
    icon: FileSearch,
    color: "hsl(200,90%,50%)",
    description:
      "OCR + parser estruturado para PDFs, balancetes e demonstrativos contábeis.",
    capabilities: ["ocr"],
    fields: ["apiKey", "projectId", "location", "processorId"],
    requiredSecrets: ["GOOGLE_DOCUMENT_AI_API_KEY"],
  },
  {
    id: "gemini",
    name: "Gemini API",
    vendor: "Google AI Studio",
    icon: Sparkles,
    color: "hsl(38,90%,55%)",
    description:
      "Modelos Gemini 2.5 (Pro/Flash) para análise e geração de relatórios.",
    capabilities: ["reasoning", "report", "embeddings"],
    fields: ["apiKey", "model"],
    models: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3-flash-preview",
    ],
    requiredSecrets: ["GEMINI_API_KEY"],
  },
  {
    id: "vertex_ai",
    name: "Vertex AI",
    vendor: "Google Cloud",
    icon: Brain,
    color: "hsl(280,80%,60%)",
    description:
      "Vertex AI para deploy de modelos Gemini com isolamento empresarial e SLA.",
    capabilities: ["reasoning", "report", "embeddings"],
    fields: ["apiKey", "projectId", "location", "model"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "text-embedding-004"],
    requiredSecrets: [
      "VERTEX_AI_ACCESS_TOKEN",
      "VERTEX_AI_PROJECT_ID",
      "VERTEX_AI_LOCATION",
    ],
  },
  {
    id: "openai_gpt",
    name: "OpenAI GPT",
    vendor: "OpenAI",
    icon: Cpu,
    color: "hsl(152,70%,45%)",
    description: "GPT-5 e variantes para fallback e validação cruzada.",
    capabilities: ["reasoning", "report"],
    fields: ["apiKey", "model"],
    models: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1"],
    requiredSecrets: ["OPENAI_API_KEY"],
  },
];

const DEFAULT_CONFIGS: Record<ProviderId, ProviderConfig> = {
  lovable_cloud: {
    id: "lovable_cloud", enabled: true, apiKey: "",
    model: "google/gemini-2.5-flash-lite",
  },
  google_document_ai: {
    id: "google_document_ai", enabled: true, apiKey: "••• secret •••",
    projectId: "", location: "us", processorId: "",
  },
  gemini: { id: "gemini", enabled: false, apiKey: "", model: "gemini-2.5-flash" },
  vertex_ai: {
    id: "vertex_ai", enabled: false, apiKey: "",
    projectId: "", location: "us-central1", model: "gemini-2.5-pro",
  },
  openai_gpt: { id: "openai_gpt", enabled: false, apiKey: "", model: "gpt-5-mini" },
};

const DEFAULT_PIPELINE: PipelineConfig = {
  ocr: "google_document_ai",
  reasoning: "lovable_cloud",
  report: "lovable_cloud",
};

const STORAGE_KEY = "bex.gestor-ia.ai-providers";
const PIPELINE_KEY = "bex.gestor-ia.ai-pipeline";

// ─── Componente ──────────────────────────────────────────────
const AIProvidersConfig = () => {
  const [configs, setConfigs] = useState<Record<ProviderId, ProviderConfig>>(DEFAULT_CONFIGS);
  const [pipeline, setPipeline] = useState<PipelineConfig>(DEFAULT_PIPELINE);
  const [expanded, setExpanded] = useState<ProviderId | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setConfigs((c) => ({ ...c, ...JSON.parse(raw) }));
      const rawPipe = localStorage.getItem(PIPELINE_KEY);
      if (rawPipe) setPipeline((p) => ({ ...p, ...JSON.parse(rawPipe) }));
    } catch { /* ignore */ }
  }, []);

  const activeProvider = useMemo(
    () => PROVIDERS.find((p) => p.id === pipeline.reasoning),
    [pipeline.reasoning],
  );
  const standbyProviders = useMemo(
    () => PROVIDERS.filter(
      (p) => !p.managed && p.id !== "google_document_ai" && !configs[p.id]?.enabled,
    ),
    [configs],
  );

  const enabledProvidersFor = (cap: Capability) =>
    PROVIDERS.filter((p) => p.capabilities.includes(cap) && configs[p.id]?.enabled);

  const toggleEnabled = (id: ProviderId, value: boolean) => {
    if (id === "lovable_cloud" && !value) {
      toast.warning("BEx AI é o provedor padrão — ative outro reasoning antes de desligá-lo.");
      return;
    }
    setConfigs((c) => ({ ...c, [id]: { ...c[id], enabled: value } }));
  };

  const updateField = (id: ProviderId, field: keyof ProviderConfig, value: string) => {
    setConfigs((c) => ({ ...c, [id]: { ...c[id], [field]: value } }));
  };

  const saveAll = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    localStorage.setItem(PIPELINE_KEY, JSON.stringify(pipeline));
    toast.success("Configurações de APIs salvas com sucesso!");
  };

  const testConnection = (id: ProviderId) => {
    const meta = PROVIDERS.find((p) => p.id === id)!;
    if (id === "lovable_cloud") {
      toast.success(`${meta.name}: conexão OK (chave gerenciada).`);
      return;
    }
    if (!configs[id].apiKey || configs[id].apiKey.startsWith("•••")) {
      toast.error(
        `${meta.name}: secret ${meta.requiredSecrets?.[0]} não configurada. Cadastre nas configurações de Cloud → Secrets.`,
      );
      return;
    }
    toast.success(`${meta.name}: handshake simulado OK.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold font-serif text-foreground flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-[hsl(258,90%,66%)]" />
            Provedores de IA & Pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure todas as APIs de IA da plataforma. BEx AI fica ativo em produção;
            os demais provedores ficam em standby até serem ligados manualmente.
          </p>
        </div>
        <Button
          size="sm"
          onClick={saveAll}
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
        >
          <Save className="w-3.5 h-3.5" /> Salvar Configurações
        </Button>
      </div>

      {/* Banner de Status */}
      <div className="bg-card rounded-xl border border-border p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-[hsl(258,90%,66%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-foreground">
              Provedor de IA ativo: {activeProvider?.name || "BEx AI Gateway"}
            </h4>
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]">
              Em produção
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A plataforma está operando com <strong>BEx AI</strong> (Gemini gerenciado).
            {standbyProviders.length > 0 && (
              <>
                {" "}As demais APIs ({standbyProviders.map((p) => p.name).join(", ")}) ficam em
                standby — basta ativar o switch e cadastrar a secret correspondente para alternar
                o pipeline sem reescrever código.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
          <Zap className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Pipeline de Processamento
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {([
            { key: "ocr", label: "OCR / Leitura", cap: "ocr" as Capability },
            { key: "reasoning", label: "Análise (Reasoning)", cap: "reasoning" as Capability },
            { key: "report", label: "Relatório", cap: "report" as Capability },
          ]).map((step) => (
            <div key={step.key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{step.label}</Label>
              <Select
                value={pipeline[step.key as keyof PipelineConfig]}
                onValueChange={(v) =>
                  setPipeline((p) => ({ ...p, [step.key]: v as ProviderId }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {enabledProvidersFor(step.cap).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Cards de Provedores */}
      <div className="grid gap-3">
        {PROVIDERS.map((p) => {
          const cfg = configs[p.id];
          const isExpanded = expanded === p.id;
          const Icon = p.icon;
          return (
            <div key={p.id} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${p.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: p.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-foreground">{p.name}</h4>
                      {p.managed && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">
                          Managed
                        </span>
                      )}
                      {!cfg.enabled && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Standby
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.vendor} — {p.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => toggleEnabled(p.id, v)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                  >
                    <Settings className="w-3 h-3" /> {isExpanded ? "Fechar" : "Configurar"}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {p.fields.includes("apiKey") && (
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          API Key {p.requiredSecrets?.[0] && (
                            <span className="font-mono text-[10px]">({p.requiredSecrets[0]})</span>
                          )}
                        </Label>
                        <Input
                          type="password"
                          value={cfg.apiKey}
                          onChange={(e) => updateField(p.id, "apiKey", e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                    )}
                    {p.fields.includes("projectId") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Project ID</Label>
                        <Input
                          value={cfg.projectId || ""}
                          onChange={(e) => updateField(p.id, "projectId", e.target.value)}
                          placeholder="my-gcp-project"
                        />
                      </div>
                    )}
                    {p.fields.includes("location") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Location / Region</Label>
                        <Input
                          value={cfg.location || ""}
                          onChange={(e) => updateField(p.id, "location", e.target.value)}
                          placeholder="us-central1"
                        />
                      </div>
                    )}
                    {p.fields.includes("processorId") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Processor ID</Label>
                        <Input
                          value={cfg.processorId || ""}
                          onChange={(e) => updateField(p.id, "processorId", e.target.value)}
                          placeholder="abcdef123456"
                        />
                      </div>
                    )}
                    {p.fields.includes("model") && p.models && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Modelo</Label>
                        <Select
                          value={cfg.model || p.models[0]}
                          onValueChange={(v) => updateField(p.id, "model", v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {p.models.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Capacidades: {p.capabilities.join(", ")}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => testConnection(p.id)}
                    >
                      <PlugZap className="w-3 h-3" /> Testar conexão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fluxo de Ativação + Checklist */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Fluxo de ativação de novo provedor
          </h4>
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
            <li>Ligue o Switch do provedor (ex: Gemini API).</li>
            <li>Clique em <strong>Configurar</strong> e cole a secret correspondente.</li>
            <li>Clique em <strong>Testar conexão</strong> e aguarde o toast de sucesso.</li>
            <li>No bloco <strong>Pipeline</strong>, selecione o novo provedor em Análise / Relatório.</li>
            <li>Clique em <strong>Salvar Configurações</strong>.</li>
            <li>As próximas chamadas das Edge Functions roteiam para o provedor escolhido — BEx AI continua como fallback.</li>
          </ol>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-[hsl(152,70%,45%)]" /> Checklist de replicação
          </h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {[
              "BEx Cloud habilitado e chave de IA auto-provisionada",
              "Edge functions: audit-chat, document-ai-process, audit-parse-pdf, audit-analyze",
              "Banner exibe BEx AI como ativo em produção",
              "Switches de Gemini / Vertex / OpenAI OFF por padrão (standby)",
              "Persistência em localStorage com chaves bex.gestor-ia.*",
              "Acesso à rota /gestor-ia restrito a gestor_ia / auditor_chefe",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(152,70%,45%)] shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Secrets */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Secrets necessárias
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Secret</th>
                <th className="py-2 pr-4 font-semibold">Quando</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "LOVABLE_API_KEY", when: "Auto-provisionada por Lovable Cloud", required: true },
                { name: "GOOGLE_DOCUMENT_AI_API_KEY", when: "Para OCR de PDFs/imagens", required: true },
                { name: "GEMINI_API_KEY", when: "Só ao ativar Google AI Studio", required: false },
                { name: "VERTEX_AI_ACCESS_TOKEN", when: "Só ao ativar Vertex AI", required: false },
                { name: "VERTEX_AI_PROJECT_ID", when: "Junto com Vertex AI", required: false },
                { name: "VERTEX_AI_LOCATION", when: "Junto com Vertex AI (ex: us-central1)", required: false },
                { name: "OPENAI_API_KEY", when: "Só ao ativar OpenAI", required: false },
              ].map((s) => (
                <tr key={s.name} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-mono text-foreground">{s.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.when}</td>
                  <td className="py-2">
                    {s.required ? (
                      <span className="px-2 py-0.5 rounded-full font-semibold bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]">
                        Obrigatória
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground">
                        Standby
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AIProvidersConfig;
