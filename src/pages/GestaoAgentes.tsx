import { useRef, useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { toast } from "sonner";
import {
  uploadLearningFile,
  extractTextFromFile,
  processWithAI,
  markExtractionAsLearning,
  waitForOcr,
  waitForProcessing,
  listLearningExtractions,
  markAsCorrect,
} from "@/services/learningService";
import { PROSPECCAO_TOPICS, buildLearningPath, getTopicBySlug } from "@/lib/prospeccaoTopics";
import { getAgentForTopic } from "@/lib/specializedAgents";
import { Loader2, FolderTree, X, Sparkles } from "lucide-react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AIProvidersConfig from "@/components/gestor/AIProvidersConfig";
import TabFinanceiroTokens from "@/components/gestor/TabFinanceiroTokens";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload, ShieldCheck, Brain, Database, Activity, Bot, Plug,
  ArrowLeft, FileText, CheckCircle2, AlertTriangle, Eye, Cpu,
  Thermometer, MessageSquare, SlidersHorizontal, Plus, RefreshCw,
  Webhook, Globe, CreditCard, Settings, Clock, Zap, Search,
  TrendingUp, FileSearch, GitBranch, Layers, Wallet
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";

// ─── Mock Data baseado no MD ─────────────────────────────────
const pipelineStages = [
  { name: "Parser estrutural", desc: "XLSX/CSV/PDF tabular - 100% offline", icon: FileText, color: "hsl(258,90%,66%)" },
  { name: "Fast-path por código", desc: "1.x ativo, 2.x passivo, 3.x receita…", icon: GitBranch, color: "hsl(200,80%,55%)" },
  { name: "Cache contabil_dictionary", desc: "Match exato + embedding cosine ≥ 0.85", icon: Database, color: "hsl(152,70%,45%)" },
  { name: "STRONG_KEYWORDS regex", desc: "Caixa, Capital Social, Receita Bruta…", icon: Search, color: "hsl(38,90%,55%)" },
  { name: "LLM fallback", desc: "Gemini 2.5 Flash-Lite (timeout 45s, retry Flash em 503)", icon: Brain, color: "hsl(0,80%,55%)" },
  { name: "Insights pós-extração", desc: "Gemini 2.5 Pro com few-shot RAG", icon: Zap, color: "hsl(258,90%,66%)" },
];

const recentDocs: any[] = [];
const validationScores: any[] = [];
const fraudAlerts: any[] = [];
const accuracyDistribution: any[] = [];
const learningEvolution: any[] = [];
const datasetItems: any[] = [];

const performanceStages = [
  { step: "Parser estrutural",  p50: 1.2,  p95: 3.4,  p99: 5.1 },
  { step: "OCR (Google Vision)", p50: 8.7,  p95: 22.3, p99: 38.5 },
  { step: "Embedding",          p50: 0.9,  p95: 2.1,  p99: 3.4 },
  { step: "Prompt Builder (RAG)", p50: 0.6, p95: 1.4,  p99: 2.0 },
  { step: "LLM Agente",         p50: 12.4, p95: 31.8, p99: 47.2 },
  { step: "Validação + Antifraude", p50: 0.4, p95: 1.2, p99: 1.9 },
  { step: "Pipeline total (E2E)", p50: 28.5, p95: 72.4, p99: 105.3 },
];

const personaVarLabels = [
  { key: "Rn", label: "Rigor Noprospeccaotivo (Rₙ)" },
  { key: "Cr", label: "Conservadorismo (Cᵣ)" },
  { key: "Sr", label: "Sensibilidade Risco (Sᵣ)" },
  { key: "Da", label: "Profundidade Analítica (Dₐ)" },
  { key: "Fl", label: "Foprospeccaolidade (Fₗ)" },
  { key: "Ap", label: "Agressividade (Aₚ)" },
];

const defaultPersonas: Record<string, number[]> = {
  "Agente Auditor Contábil": [0.9, 0.8, 0.9, 0.9, 0.8, 0.9],
  "Agente Financeiro": [0.7, 0.7, 0.8, 0.8, 0.6, 0.6],
  "Agente de Relatório": [0.6, 0.5, 0.5, 0.6, 0.9, 0.5],
};

const agents = [
  { name: "Agente Auditor Contábil", type: "Auditoria", model: "Gemini 2.5 Pro", temp: 0.3, status: "active", tokens: "128K" },
  { name: "Agente Financeiro", type: "Financeiro", model: "GPT OSS", temp: 0.2, status: "active", tokens: "64K" },
  { name: "Agente de Relatório", type: "Relatório", model: "Gemini 2.5 Flash", temp: 0.4, status: "paused", tokens: "32K" },
];

const integrations = [
  { name: "BigQuery", type: "Data Warehouse", status: "active", icon: Database },
  { name: "API Contábil", type: "ERP", status: "active", icon: Globe },
  { name: "Webhooks", type: "Notificações", status: "active", icon: Webhook },
  { name: "API Financeira", type: "Banking", status: "inactive", icon: CreditCard },
  { name: "Upload SFTP", type: "Arquivos", status: "paused", icon: Upload },
];

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    active: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]",
    completed: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]",
    inactive: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]",
    failed: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]",
    paused: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]",
    processing: "bg-[hsl(200,80%,55%)]/10 text-[hsl(200,80%,55%)]",
  };
  const labels: Record<string, string> = {
    active: "Ativo", inactive: "Inativo", paused: "Pausado",
    completed: "Concluído", failed: "Falhou", processing: "Processando",
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || ""}`}>{labels[status] || status}</span>;
};

const fmtTime = (sec: number) => sec < 60 ? `${sec.toFixed(1)} s` : `${Math.floor(sec/60)}m ${Math.round(sec%60)}s`;

// ─── Aba 1: Upload & Processamento ───────────────────────────
// ─── Aba 1: Upload & Processamento ───────────────────────────
const MAX_FILES = 50;

type TimelineStage = "upload" | "ocr" | "ai_classify" | "ai_extract" | "validate";
type StageStatus = "pending" | "running" | "done" | "failed";
const TIMELINE_STAGES: { key: TimelineStage; label: string; weight: number }[] = [
  { key: "upload",      label: "Upload",         weight: 5 },
  { key: "ocr",         label: "OCR / Parser",   weight: 25 },
  { key: "ai_classify", label: "Classificação IA", weight: 15 },
  { key: "ai_extract",  label: "Extração IA",    weight: 45 },
  { key: "validate",    label: "Validação",      weight: 10 },
];

interface TimelineItem {
  name: string;
  topic: string | null;
  startedAt: number;
  finishedAt: number | null;
  stages: Record<TimelineStage, StageStatus>;
  currentStage: TimelineStage;
  progress: number;
  status: "queued" | "processing" | "completed" | "failed";
  etaSec: number | null;
  durationSec: number | null;
  score: number | null;
  errorMsg?: string;
}

const DEFAULT_AVG_DURATION_SEC = 60;
const fmtDur = (sec: number) => sec < 60 ? `${sec.toFixed(0)}s` : `${Math.floor(sec/60)}m ${Math.round(sec%60)}s`;

const TabUploadProcessamento = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stageMsg, setStageMsg] = useState("");
  const [recent, setRecent] = useState<{ name: string; topic: string | null; status: string; duration: string; score: number | null }[]>([]);
  const [topicSlug, setTopicSlug] = useState<string>("");
  const [pending, setPending] = useState<File[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [tick, setTick] = useState(0);
  const avgDurationRef = useRef<number>(DEFAULT_AVG_DURATION_SEC);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [busy]);

  const groupedTopics = useMemo(() => {
    const groups: Record<string, typeof PROSPECCAO_TOPICS> = {};
    for (const t of PROSPECCAO_TOPICS) {
      (groups[t.group] ||= []).push(t);
    }
    return groups;
  }, []);

  const topic = getTopicBySlug(topicSlug);

  const handlePick = () => fileRef.current?.click();

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    setPending((prev) => {
      const next = [...prev, ...files].slice(0, MAX_FILES);
      if (prev.length + files.length > MAX_FILES) {
        toast.warning(`Limite de ${MAX_FILES} arquivos por lote — extras ignorados.`);
      }
      return next;
    });
  };

  const removePending = (idx: number) =>
    setPending((p) => p.filter((_, i) => i !== idx));

  const clearPending = () => setPending([]);

  const updateTimeline = (idx: number, patch: Partial<TimelineItem>) => {
    setTimeline((tl) => tl.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const setStage = (idx: number, stage: TimelineStage, status: StageStatus) => {
    setTimeline((tl) => tl.map((it, i) => {
      if (i !== idx) return it;
      const stages = { ...it.stages, [stage]: status };
      const total = TIMELINE_STAGES.reduce((acc, s) => acc + s.weight, 0);
      let done = 0;
      for (const s of TIMELINE_STAGES) {
        if (stages[s.key] === "done") done += s.weight;
        else if (stages[s.key] === "running") done += s.weight * 0.5;
      }
      const progress = Math.round((done / total) * 100);
      return { ...it, stages, currentStage: stage, progress };
    }));
  };

  const startProcessing = async () => {
    if (!topic) {
      toast.error("Selecione um tópico/pasta de aprendizado antes de processar.");
      return;
    }
    if (!pending.length) {
      toast.error("Nenhum arquivo selecionado.");
      return;
    }

    setBusy(true);
    const filesToProcess = [...pending];
    setPending([]);

    const initial: TimelineItem[] = filesToProcess.map((f) => ({
      name: f.name,
      topic: topic.label,
      startedAt: 0,
      finishedAt: null,
      stages: { upload: "pending", ocr: "pending", ai_classify: "pending", ai_extract: "pending", validate: "pending" },
      currentStage: "upload",
      progress: 0,
      status: "queued",
      etaSec: avgDurationRef.current,
      durationSec: null,
      score: null,
    }));
    setTimeline(initial);

    const durations: number[] = [];
    const CONCURRENCY = 3;
    // Limiar para auto-promover extração a `prompt_examples` (few-shot por pasta).
    // Acima disso o aprendizado evolui sem precisar de revisão humana manual.
    const AUTO_LEARN_THRESHOLD = 0.92;
    let autoLearned = 0;

    const runOne = async (i: number) => {
      const file = filesToProcess[i];
      const t0 = performance.now();
      const idx = i;
      updateTimeline(idx, { startedAt: Date.now(), status: "processing", etaSec: avgDurationRef.current });

      const tempRow = { name: file.name, topic: topic.label, status: "processing", duration: "—", score: null as number | null };
      setRecent((r) => [tempRow, ...r]);

      try {
        setStage(idx, "upload", "running");
        setStageMsg(`Enviando ${file.name}...`);
        const uploaded = await uploadLearningFile(file);
        setStage(idx, "upload", "done");

        setStage(idx, "ocr", "running");
        setStageMsg(`OCR / parser — ${file.name}`);
        let extracted = await extractTextFromFile(file, uploaded);
        if (extracted.asyncOcrId) {
          const polled = await waitForOcr(extracted.asyncOcrId);
          extracted = { ...extracted, rawText: polled.rawText, normalizedText: polled.normalizedText, ocrConfidence: polled.confidence, pageCount: polled.pageCount };
        }
        setStage(idx, "ocr", "done");

        const learningPath = buildLearningPath(topic.slug, uploaded.fileName);

        setStage(idx, "ai_classify", "running");
        setStageMsg(`Processando IA — ${file.name}`);
        const aiStart = await processWithAI({
          rawText: extracted.rawText,
          normalizedText: extracted.normalizedText,
          path: learningPath,
          ocrConfidence: extracted.ocrConfidence,
        });
        let aiResult: any = aiStart;
        if ((aiStart as any)?.status === "pending" && (aiStart as any)?.id) {
          aiResult = await waitForProcessing((aiStart as any).id, (s: any) => {
            const p = s?.progress ?? 0;
            if (p < 25) {
              setStage(idx, "ai_classify", "running");
            } else if (p < 95) {
              setStage(idx, "ai_classify", "done");
              setStage(idx, "ai_extract", "running");
            } else {
              setStage(idx, "ai_classify", "done");
              setStage(idx, "ai_extract", "done");
            }
          });
        }
        setStage(idx, "ai_classify", "done");
        setStage(idx, "ai_extract", "done");

        setStage(idx, "validate", "running");
        const extractionId = (aiResult as any)?.extraction_id ?? (aiResult as any)?.id;
        if (extractionId) {
          await markExtractionAsLearning(extractionId, {
            path: uploaded.path,
            mimeType: uploaded.mimeType,
            fileName: uploaded.fileName,
          });
        }

        const score = (aiResult as any)?.final_confidence ?? (aiResult as any)?.validation?.confianca ?? null;

        // ── AUTO-APRENDIZADO ─────────────────────────────────────────
        // Se a extração veio com alta confiança, promovemos automaticamente
        // para `prompt_examples` (via ai-validate → embedding + few-shot).
        // Isso fecha o ciclo: cada upload de qualidade ENSINA o modelo.
        if (extractionId && typeof score === "number" && score >= AUTO_LEARN_THRESHOLD) {
          try {
            const all = await listLearningExtractions(50);
            const ext = all.find((e) => e.id === extractionId);
            if (ext && ext.classe && ext.extracted_data) {
              await markAsCorrect(ext);
              autoLearned += 1;
            }
          } catch (e) {
            console.warn("[auto-learn] falhou (não bloqueia):", e);
          }
        }
        setStage(idx, "validate", "done");

        const durSec = (performance.now() - t0) / 1000;
        durations.push(durSec);
        avgDurationRef.current = durations.reduce((a, b) => a + b, 0) / durations.length;

        updateTimeline(idx, { status: "completed", finishedAt: Date.now(), durationSec: durSec, score, etaSec: 0, progress: 100 });

        const dur = durSec.toFixed(1) + "s";
        setRecent((r) => r.map((x) => (x === tempRow ? { ...tempRow, status: "completed", duration: dur, score } : x)));
        toast.success(`${file.name} → ${topic.label}`);
      } catch (err: any) {
        console.error("[GestaoAgentes] upload pipeline error", err);
        const durSec = (performance.now() - t0) / 1000;
        const dur = durSec.toFixed(1) + "s";
        setTimeline((tl) => tl.map((it, j) => {
          if (j !== idx) return it;
          const stages = { ...it.stages };
          for (const s of TIMELINE_STAGES) {
            if (stages[s.key] === "running") stages[s.key] = "failed";
          }
          return { ...it, stages, status: "failed", finishedAt: Date.now(), durationSec: durSec, errorMsg: err?.message || String(err), etaSec: 0 };
        }));
        setRecent((r) => r.map((x) => (x === tempRow ? { ...tempRow, status: "failed", duration: dur, score: null } : x)));
        toast.error(`Falha ao processar ${file.name}: ${err?.message || err}`);
      }
    };

    // Pool de workers paralelos (CONCURRENCY simultâneos) para reduzir
    // o tempo total do lote em até ~3× sem sobrecarregar o gateway IA.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, filesToProcess.length) }, async () => {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= filesToProcess.length) return;
        await runOne(myIdx);
      }
    });
    await Promise.all(workers);

    setBusy(false);
    setStageMsg("");
    if (autoLearned > 0) {
      toast.success(`${autoLearned} exemplo(s) promovido(s) automaticamente ao few-shot por alta confiança`);
    }
    // Limpa tópico e fila ao concluir o lote, liberando para nova carga.
    setTopicSlug("");
    setPending([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const batchTotal = timeline.length;
  const batchDone = timeline.filter((t) => t.status === "completed" || t.status === "failed").length;
  const batchRunning = timeline.find((t) => t.status === "processing");
  const elapsedSec = batchRunning ? (Date.now() - batchRunning.startedAt) / 1000 : 0;
  const etaForCurrent = batchRunning ? Math.max(0, (batchRunning.etaSec ?? avgDurationRef.current) - elapsedSec) : 0;
  const remainingFiles = Math.max(0, batchTotal - batchDone - (batchRunning ? 1 : 0));
  const totalEtaSec = etaForCurrent + remainingFiles * avgDurationRef.current;
  const batchComplete = batchTotal > 0 && batchDone === batchTotal && !busy;
  const batchProgressPct = batchComplete ? 100 : (batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0);
  const batchTotalDurationSec = timeline.reduce((acc, t) => acc + (t.durationSec ?? 0), 0);
  void tick;

  return (
  <div className="space-y-6">
    {/* Upload zone */}
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-2">
        <FolderTree className="w-5 h-5 text-[hsl(258,90%,66%)] mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-foreground">Aprendizado OCR + IA por pasta</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Selecione o tópico/pasta correspondente — o pipeline usa esse contexto para classificar,
            extrair e treinar few-shot por similaridade de pasta.
          </p>
        </div>
      </div>

      {/* Step 1 — Tópico */}
      <div>
        <Label className="text-xs">1. Tópico / pasta de aprendizado *</Label>
        <Select value={topicSlug} onValueChange={setTopicSlug} disabled={busy}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecione o tópico OneDrive correspondente..." />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {Object.entries(groupedTopics).map(([group, items]) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    <span className="font-mono text-muted-foreground mr-2">#{String(t.id).padStart(2, "0")}</span>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {topic && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Pasta OneDrive: <code className="bg-muted px-1 py-0.5 rounded font-mono">{topic.slug}</code>
          </p>
        )}
      </div>

      {/* Agente especializado resolvido pelo tópico */}
      {topic && (() => {
        const agent = getAgentForTopic(topic.id);
        if (!agent) return null;
        return (
          <div className="rounded-lg border border-[hsl(258,90%,66%)]/30 bg-[hsl(258,90%,66%)]/5 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-[hsl(258,90%,66%)]/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">Agente atribuído:</span>
                <Badge className="bg-[hsl(258,90%,66%)]/15 text-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,66%)]/20 border-[hsl(258,90%,66%)]/30">
                  {agent.name}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">{agent.ai_model}</Badge>
                <Badge variant="outline" className="text-[10px]">temp {agent.temperature}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{agent.description}</p>
              <p className="text-[10px] text-muted-foreground/80 mt-1">
                Cobre {agent.topics.length} tópico(s) Prospeccao · Aceita: {agent.accepted_types.join(", ")}
              </p>
            </div>
          </div>
        );
      })()}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.csv,.txt,.log,.xlsx,.xls,.xlsm,application/pdf,image/*,text/*"
        onChange={onSelectFiles}
        className="hidden"
      />

      {/* Step 2 — Upload (só após tópico selecionado) */}
      {!topic ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/20">
          <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Selecione um tópico acima para liberar o envio de documentos.</p>
        </div>
      ) : (
        <div className="border-2 border-dashed border-[hsl(258,90%,66%)]/40 rounded-lg p-6 text-center hover:border-[hsl(258,90%,66%)] transition-colors bg-[hsl(258,90%,66%)]/5">
          <Upload className="w-8 h-8 text-[hsl(258,90%,66%)] mx-auto mb-2" />
          <h5 className="font-semibold text-foreground text-sm">Enviar documento para o pipeline</h5>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Os arquivos serão associados à pasta <strong className="text-foreground">#{String(topic.id).padStart(2, "0")} — {topic.label}</strong>.
          </p>
          <Button variant="outline" onClick={handlePick} disabled={busy} className="gap-1.5">
            <Upload className="w-4 h-4" /> Selecionar arquivos
          </Button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {pending.length} arquivo(s) na fila
              {topic && <> · destino: <Badge variant="outline" className="ml-1">#{String(topic.id).padStart(2, "0")} {topic.label}</Badge></>}
            </span>
            <Button variant="ghost" size="sm" onClick={clearPending} disabled={busy} className="h-7 text-xs">Limpar fila</Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pending.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-card rounded px-2 py-1.5 border border-border">
                <span className="truncate flex-1 mr-2">{f.name}</span>
                <span className="text-muted-foreground font-mono mr-2">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => removePending(i)} disabled={busy} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground">
          {pending.length === 0 && !busy && topic && "Adicione até 50 arquivos por lote (PDF, imagens, planilhas, CSV)."}
          {busy && stageMsg}
        </p>
        <Button onClick={startProcessing} disabled={busy || !pending.length || !topic} className="gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {busy ? "Processando..." : `Processar ${pending.length || ""} arquivo(s)`}
        </Button>
      </div>
    </div>

    {/* Timeline de Evolução do Lote */}
    {timeline.length > 0 && (
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Timeline de evolução do lote
          </h4>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{batchDone}</span> / {batchTotal} concluído(s)
            </span>
            {busy && (
              <>
                <span className="text-muted-foreground">
                  Decorrido: <span className="font-mono text-foreground">{fmtDur(elapsedSec)}</span>
                </span>
                <span className="text-muted-foreground">
                  ETA total: <span className="font-mono text-[hsl(258,90%,66%)]">{fmtDur(totalEtaSec)}</span>
                </span>
              </>
            )}
            {batchComplete && (
              <>
                <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30 hover:bg-[hsl(142,76%,36%)]/20 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Lote concluído — 100%
                </Badge>
                <span className="text-muted-foreground">
                  Tempo total: <span className="font-mono text-foreground">{fmtDur(batchTotalDurationSec)}</span>
                </span>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => !busy && setTimeline([])} disabled={busy} className="h-7 text-xs">
              Limpar
            </Button>
          </div>
        </div>

        {/* Barra de progresso global */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Progresso global do lote</span>
            <span className={`font-mono ${batchComplete ? "text-[hsl(142,76%,36%)] font-semibold" : ""}`}>{batchProgressPct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                batchComplete
                  ? "bg-[hsl(142,76%,36%)]"
                  : "bg-gradient-to-r from-[hsl(258,90%,66%)] to-[hsl(217,91%,50%)]"
              }`}
              style={{ width: `${batchProgressPct}%` }}
            />
          </div>
        </div>

        {/* Lista de arquivos com timeline horizontal */}
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {timeline.map((item, i) => {
            const itemElapsed = item.startedAt
              ? ((item.finishedAt ?? Date.now()) - item.startedAt) / 1000
              : 0;
            const itemEta = item.status === "processing"
              ? Math.max(0, (item.etaSec ?? avgDurationRef.current) - itemElapsed)
              : null;
            return (
              <div key={i} className="border border-border rounded-lg p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {item.status === "processing" && <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(258,90%,66%)] shrink-0" />}
                    {item.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(142,76%,36%)] shrink-0" />}
                    {item.status === "failed" && <AlertTriangle className="w-3.5 h-3.5 text-[hsl(0,84%,60%)] shrink-0" />}
                    {item.status === "queued" && <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                    {item.topic && (
                      <Badge variant="outline" className="text-[10px] shrink-0">{item.topic}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                    {item.status === "processing" && itemEta !== null && (
                      <span className="text-muted-foreground">ETA {fmtDur(itemEta)}</span>
                    )}
                    {item.durationSec !== null && (
                      <span className="text-foreground">{fmtDur(item.durationSec)}</span>
                    )}
                    {item.score !== null && (
                      <span className={`font-semibold ${item.score >= 0.67 ? "text-[hsl(142,76%,36%)]" : item.score >= 0.33 ? "text-[hsl(38,92%,50%)]" : "text-[hsl(0,84%,60%)]"}`}>
                        {(item.score * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-foreground">{item.progress}%</span>
                  </div>
                </div>

                {/* Stages timeline */}
                <div className="flex items-center gap-1">
                  {TIMELINE_STAGES.map((s, sIdx) => {
                    const st = item.stages[s.key];
                    const bg = st === "done" ? "bg-[hsl(142,76%,36%)]"
                      : st === "running" ? "bg-[hsl(258,90%,66%)] animate-pulse"
                      : st === "failed" ? "bg-[hsl(0,84%,60%)]"
                      : "bg-muted";
                    return (
                      <div key={s.key} className="flex-1 flex flex-col items-stretch gap-1">
                        <div className={`h-1.5 rounded-full ${bg} transition-colors`} title={`${s.label}: ${st}`} />
                        <span className={`text-[9px] text-center truncate ${
                          st === "done" ? "text-[hsl(142,76%,36%)]"
                          : st === "running" ? "text-[hsl(258,90%,66%)] font-semibold"
                          : st === "failed" ? "text-[hsl(0,84%,60%)]"
                          : "text-muted-foreground"
                        }`}>
                          {sIdx + 1}. {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Barra de progresso do arquivo */}
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      item.status === "failed"
                        ? "bg-[hsl(0,84%,60%)]"
                        : item.status === "completed"
                        ? "bg-[hsl(142,76%,36%)]"
                        : "bg-gradient-to-r from-[hsl(258,90%,66%)] to-[hsl(217,91%,50%)]"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>

                {item.errorMsg && (
                  <p className="text-[10px] text-[hsl(0,84%,60%)] mt-1 truncate" title={item.errorMsg}>
                    Erro: {item.errorMsg}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}


    <div className="bg-card rounded-xl border border-border p-5">
      <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Layers className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Fluxo do pipeline (MD §10 — engine v4)
      </h4>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {pipelineStages.map((s, i) => (
          <div key={i} className="bg-muted/30 rounded-lg p-3 flex items-start gap-3" style={{ borderLeftWidth: 3, borderLeftColor: s.color }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}15` }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{i + 1}. {s.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Recent docs */}
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Documentos recentes
        </h4>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setRecent([])}><RefreshCw className="w-3 h-3" /> Limpar</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-muted/40">
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Documento</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tópico</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Tempo</th>
          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Score</th>
        </tr></thead>
        <tbody>
          {recent.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">Nenhum documento processado nesta sessão.</td></tr>
          ) : recent.map((d, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 text-foreground font-medium">{d.name}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{d.topic || "—"}</td>
              <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
              <td className="px-4 py-3 text-right font-mono text-foreground">{d.duration}</td>
              <td className="px-4 py-3 text-right font-mono text-foreground">{d.score !== null ? d.score.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
};

// ─── Aba 2: Validação Inteligente ────────────────────────────
const TabValidacaoInteligente = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {validationScores.map((v, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-5" style={{ borderTopWidth: 3, borderTopColor: v.color }}>
          <p className="text-[11px] font-mono font-semibold" style={{ color: v.color }}>{v.name}</p>
          <p className="text-3xl font-bold font-mono text-foreground mt-2">{(v.value * 100).toFixed(0)}%</p>
          <p className="text-[11px] text-muted-foreground mt-2">{v.desc}</p>
        </div>
      ))}
    </div>

    {/* Antifraude */}
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(0,80%,55%)]" /> Antifraude inteligente
        </h4>
        <span className="text-xs text-muted-foreground">Z-score, hash duplicado, séries faltantes</span>
      </div>
      <div className="space-y-2">
        {fraudAlerts.map((a, i) => {
          const sevColor = a.severity === "high" ? "hsl(0,80%,55%)" : a.severity === "medium" ? "hsl(38,90%,55%)" : "hsl(200,80%,55%)";
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30" style={{ borderLeftWidth: 3, borderLeftColor: sevColor }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: sevColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{a.msg}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">📄 {a.doc}</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs">Investigar</Button>
            </div>
          );
        })}
      </div>
    </div>

    {/* Auto-retry config */}
    <div className="bg-card rounded-xl border border-border p-5">
      <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Regras de ação (motor de qualidade)
      </h4>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="font-semibold text-foreground">final_confidence ≥ 0.85</p>
          <p className="text-xs text-muted-foreground mt-1">✅ Aceita automaticamente</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="font-semibold text-foreground">0.50 ≤ conf &lt; 0.85</p>
          <p className="text-xs text-muted-foreground mt-1">🔁 Auto-retry 1x com modelo escalado</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="font-semibold text-foreground">conf &lt; 0.50</p>
          <p className="text-xs text-muted-foreground mt-1">🚨 Quarentena → revisão humana</p>
        </div>
      </div>
    </div>
  </div>
);

// ─── Aba 3: Aprendizado da IA ────────────────────────────────
const TabAprendizadoIA = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Acurácia atual", value: "95.0%", icon: Brain, color: "hsl(258,90%,66%)" },
          { label: "Exemplos few-shot", value: "134", icon: Database, color: "hsl(152,70%,45%)" },
          { label: "Melhoria 6 meses", value: "+17pp", icon: TrendingUp, color: "hsl(200,80%,55%)" },
          { label: "Pendentes revisão", value: "8", icon: AlertTriangle, color: "hsl(38,90%,55%)" },
        ].map((k, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${k.color}15` }}>
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Evolução acurácia + dataset
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={learningEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(215,12%,50%)" domain={[60, 100]} unit="%" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(152,70%,45%)" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" type="monotone" dataKey="acc" stroke="hsl(258,90%,66%)" strokeWidth={2.5} name="Acurácia %" />
              <Line yAxisId="right" type="monotone" dataKey="examples" stroke="hsl(152,70%,45%)" strokeWidth={2} name="Exemplos validados" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Distribuição acurácia (extração)
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={accuracyDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3}>
                {accuracyDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {accuracyDistribution.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: r.color }} /> {r.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5" style={{ borderTopWidth: 3, borderTopColor: "hsl(258,90%,66%)" }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Loop completo: ground truth → embedding → RAG few-shot
            </h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Cada correção humana vira embedding em <code className="bg-muted px-1 rounded">prompt_examples</code>. Em runs futuros, <code className="bg-muted px-1 rounded">match_dataset_validated()</code> recupera os top-3 exemplos similares (cosine ≥ 0.75) e injeta como few-shot — disparando acurácia para 95%+.
            </p>
          </div>
          <Button onClick={() => navigate("/gestor-ia/aprendizado")} className="gap-1.5">
            <Brain className="w-4 h-4" /> Abrir Tela de Aprendizado
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Aba 4: Dataset & Histórico ──────────────────────────────
const TabDatasetHistorico = () => (
  <div className="space-y-6">
    <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input placeholder="Buscar por classe, agente ou validador..." className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground" />
      </div>
      <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo exemplo validado</Button>
    </div>

    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <Database className="w-4 h-4 text-[hsl(152,70%,45%)]" /> dataset_validated — base proprietária (RAG)
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          Cada linha é um exemplo aprovado pelo gestor que alimenta o prompt builder via <code className="bg-muted px-1 rounded">prompt_examples.embedding</code> (768D).
        </p>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-muted/40">
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ID</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Classe</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Agente</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Validado por</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Data</th>
          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Peso</th>
        </tr></thead>
        <tbody>
          {datasetItems.map((d, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.id}</td>
              <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]">{d.classe}</span></td>
              <td className="px-4 py-3 text-foreground">{d.agent}</td>
              <td className="px-4 py-3 text-muted-foreground">{d.validatedBy}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{d.date}</td>
              <td className="px-4 py-3 text-right font-mono text-foreground">{d.weight.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Aba 5: Perfoprospeccaonce ──────────────────────────────────────
const TabPerfoprospeccaonce = () => {
  const totalE2E = performanceStages.find(s => s.step.includes("E2E"))!;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tempo médio (p50)", value: fmtTime(totalE2E.p50), sub: "Mediana E2E", icon: Clock, color: "hsl(258,90%,66%)" },
          { label: "Tempo p95", value: fmtTime(totalE2E.p95), sub: "95% abaixo disto", icon: Activity, color: "hsl(38,90%,55%)" },
          { label: "Tempo p99", value: fmtTime(totalE2E.p99), sub: "Pior caso típico", icon: AlertTriangle, color: "hsl(0,80%,55%)" },
          { label: "Disponibilidade", value: "99.4%", sub: "(total - falhas) / total", icon: CheckCircle2, color: "hsl(152,70%,45%)" },
        ].map((k, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${k.color}15` }}>
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">{k.value}</p>
            <p className="text-sm font-semibold text-foreground mt-1">{k.label}</p>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-[hsl(258,90%,66%)]" /> SLA por etapa do pipeline
          </h4>
          <p className="text-xs text-muted-foreground mt-1">Percentis a partir de <code className="bg-muted px-1 rounded">pipeline_logs.duration_ms</code>.</p>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/40">
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Etapa</th>
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">p50</th>
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">p95</th>
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">p99</th>
          </tr></thead>
          <tbody>
            {performanceStages.map((s, i) => (
              <tr key={i} className={`border-b border-border last:border-0 hover:bg-muted/30 ${s.step.includes("E2E") ? "bg-muted/30 font-semibold" : ""}`}>
                <td className="px-4 py-3 text-foreground">{s.step}</td>
                <td className="px-4 py-3 text-right font-mono text-foreground">{fmtTime(s.p50)}</td>
                <td className="px-4 py-3 text-right font-mono text-foreground">{fmtTime(s.p95)}</td>
                <td className="px-4 py-3 text-right font-mono text-foreground">{fmtTime(s.p99)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Aba 6: Registro de Agentes & Integrações ────────────────
const TabRegistroIntegracoes = () => {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [personas, setPersonas] = useState<Record<string, number[]>>(defaultPersonas);
  const navigate = useNavigate();

  const updatePersonaVar = (agentName: string, idx: number, val: number) => {
    setPersonas(prev => ({ ...prev, [agentName]: prev[agentName].map((v, i) => i === idx ? val : v) }));
  };
  const getScore = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;

  return (
    <div className="space-y-6">
      <AIProvidersConfig />

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Registro de agentes
          </h4>
          <p className="text-sm text-muted-foreground">Modelo, temperatura, tokens e Vetor de Persona Configurável (VPC).</p>
        </div>
        <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Agente</Button>
      </div>

      <div className="grid gap-4">
        {agents.map((agent, i) => {
          const isExpanded = expandedAgent === i;
          const pVals = personas[agent.name] || [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
          const score = getScore(pVals);
          return (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-[hsl(258,90%,66%)]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{agent.name}</h4>
                      <p className="text-xs text-muted-foreground">{agent.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-2">
                      <p className="text-xs text-muted-foreground">Score VPC</p>
                      <p className="text-lg font-bold font-mono text-[hsl(258,90%,66%)]">{score.toFixed(2)}</p>
                    </div>
                    <StatusBadge status={agent.status} />
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setExpandedAgent(isExpanded ? null : i)}>
                      <SlidersHorizontal className="w-3 h-3" /> {isExpanded ? "Fechar" : "Persona"}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 text-sm"><Cpu className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Modelo:</span><span className="font-semibold text-foreground">{agent.model}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Thermometer className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Temp:</span><span className="font-semibold text-foreground">{agent.temp}</span></div>
                  <div className="flex items-center gap-2 text-sm"><MessageSquare className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Tokens:</span><span className="font-semibold text-foreground">{agent.tokens}</span></div>
                </div>
                {!isExpanded && (
                  <div className="flex gap-1 mt-3">
                    {pVals.map((v, j) => (
                      <div key={j} className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" title={personaVarLabels[j].label}>
                        <div className="h-full rounded-full bg-[hsl(258,90%,66%)]" style={{ width: `${v * 100}%` }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                    <h5 className="text-sm font-semibold text-foreground">Vetor de Persona Configurável (VPC)</h5>
                  </div>
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                    {personaVarLabels.map((pv, j) => (
                      <div key={pv.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{pv.label}</span>
                          <span className="text-xs font-bold font-mono text-[hsl(258,90%,66%)]">{pVals[j].toFixed(2)}</span>
                        </div>
                        <input type="range" min={0} max={100} value={pVals[j] * 100}
                          onChange={(e) => updatePersonaVar(agent.name, j, Number(e.target.value) / 100)}
                          className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-[hsl(258,90%,66%)]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Integrações */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Plug className="w-4 h-4 text-[hsl(200,80%,55%)]" /> Integrações
            </h4>
            <p className="text-sm text-muted-foreground">ERPs, APIs financeiras, BigQuery e webhooks.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova Integração</Button>
        </div>
        <div className="grid gap-3">
          {integrations.map((integ, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[hsl(200,80%,55%)]/10 flex items-center justify-center">
                  <integ.icon className="w-5 h-5 text-[hsl(200,80%,55%)]" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground">{integ.name}</h4>
                  <p className="text-xs text-muted-foreground">{integ.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={integ.status} />
                <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2">
        <Button variant="outline" className="gap-1.5" onClick={() => navigate("/gestao-agentes-ocr")}>
          <Eye className="w-4 h-4" /> Abrir Gestão de Agentes OCR (pipeline estrutural v4)
        </Button>
      </div>
    </div>
  );
};

// ─── Página principal ────────────────────────────────────────
const GestaoAgentes = () => {
  const navigate = useNavigate();
  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/gestor-ia")}
              className="w-8 h-8 rounded-md bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white flex items-center justify-center transition-colors"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold font-serif text-foreground">Gestão de Agentes IA</h1>
              <p className="text-sm text-muted-foreground">Pipeline adaptativo, validação inteligente, aprendizado contínuo e governança dos agentes</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="upload">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
            <TabsTrigger value="upload" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Upload className="w-3.5 h-3.5" /> Upload &amp; Processamento
            </TabsTrigger>
            <TabsTrigger value="validacao" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Validação Inteligente
            </TabsTrigger>
            <TabsTrigger value="aprendizado" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Brain className="w-3.5 h-3.5" /> Aprendizado da IA
            </TabsTrigger>
            <TabsTrigger value="dataset" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Database className="w-3.5 h-3.5" /> Dataset &amp; Histórico
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Activity className="w-3.5 h-3.5" /> Perfoprospeccaonce
            </TabsTrigger>
            <TabsTrigger value="registro" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Bot className="w-3.5 h-3.5" /> Registro de Agentes &amp; Integrações
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
              <Wallet className="w-3.5 h-3.5" /> Controle Financeiro de Tokens e APIs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4"><TabUploadProcessamento /></TabsContent>
          <TabsContent value="validacao" className="mt-4"><TabValidacaoInteligente /></TabsContent>
          <TabsContent value="aprendizado" className="mt-4"><TabAprendizadoIA /></TabsContent>
          <TabsContent value="dataset" className="mt-4"><TabDatasetHistorico /></TabsContent>
          <TabsContent value="performance" className="mt-4"><TabPerfoprospeccaonce /></TabsContent>
          <TabsContent value="registro" className="mt-4"><TabRegistroIntegracoes /></TabsContent>
          <TabsContent value="financeiro" className="mt-4"><TabFinanceiroTokens /></TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default GestaoAgentes;
