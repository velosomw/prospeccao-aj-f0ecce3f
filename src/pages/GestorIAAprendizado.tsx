import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, FileText, Image as ImageIcon, Sheet, Loader2, CheckCircle2, Save, AlertTriangle, Inbox, RefreshCw, Bot, Sparkles } from "lucide-react";
import PlatformLayout from "@/components/PlatformLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QualityFraudTab from "@/components/gestor/QualityFraudTab";
import { ShieldAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  detectFileKind,
  uploadLearningFile,
  extractTextFromFile,
  processWithAI,
  waitForProcessing,
  waitForOcr,
  markExtractionAsLearning,
  listLearningExtractions,
  listPendingExtractions,
  saveGroundTruth,
  markAsCorrect,
  type UploadedLearningFile,
  type ExtractedTextResult,
  type LearningExtraction,
  type AiProcessStatus,
} from "@/services/learningService";
import { getQualityScore, type QualityScore } from "@/services/datasetService";
import SuspiciousFieldsAlert from "@/components/learning/SuspiciousFieldsAlert";

// ─────────────────────────── Helpers ───────────────────────────
const CLASSES = ["PIX", "COMPROVANTE", "BOLETO", "BALANCETE", "DRE", "BANK_RECEIPT", "NFE_COMPRAS", "OUTRO"] as const;

function fmtPct(n?: number | null) {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function confColor(c?: number | null) {
  if (c == null) return "bg-muted text-muted-foreground";
  if (c >= 0.85) return "bg-emerald-500/15 text-emerald-700";
  if (c >= 0.6) return "bg-amber-500/15 text-amber-700";
  return "bg-red-500/15 text-red-700";
}

// Highlight simples: marca aparições do(s) value(s) do JSON dentro do OCR
function highlightInText(text: string, values: string[]): JSX.Element {
  if (!text) return <>{text}</>;
  const safe = values.filter((v) => v && v.length > 1).map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (safe.length === 0) return <>{text}</>;
  const re = new RegExp(`(${safe.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark key={i} className="bg-yellow-200/80 text-foreground rounded px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ─────────────────────────── Document Viewer ───────────────────────────
function DocumentViewer({ url, mime, kind }: { url: string | null; mime?: string; kind?: string }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
        <Upload className="w-8 h-8 opacity-40" />
        <p className="text-sm">Carregue um documento para iniciar a validação</p>
      </div>
    );
  }
  if (kind === "image" || mime?.startsWith("image/")) {
    return <img src={url} alt="documento" className="max-w-full max-h-full object-contain" />;
  }
  if (kind === "pdf" || mime === "application/pdf") {
    return <iframe src={url} title="pdf" className="w-full h-full border-0 rounded" />;
  }
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
      {kind === "spreadsheet" ? <Sheet className="w-8 h-8 opacity-50" /> : <FileText className="w-8 h-8 opacity-50" />}
      <p className="text-sm">Pré-visualização não disponível para este formato.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline">Abrir arquivo</a>
    </div>
  );
}

// ─────────────────────────── JSON Editor (textarea com validação) ───────────────────────────
function JsonEditor({
  value,
  onChange,
  className,
}: {
  value: Record<string, unknown> | null;
  onChange: (v: Record<string, unknown>) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => JSON.stringify(value || {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value || {}, null, 2));
  }, [value]);

  return (
    <div className={className}>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value || "{}");
            setErr(null);
            onChange(parsed);
          } catch (er) {
            setErr(er instanceof Error ? er.message : "JSON inválido");
          }
        }}
        className="font-mono text-xs min-h-[180px]"
        spellCheck={false}
      />
      {err && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {err}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Métricas ───────────────────────────
function MetricsBar({ q }: { q: QualityScore | null }) {
  if (!q) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total processado</p>
        <p className="text-2xl font-semibold">{q.total}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Validados (humano)</p>
        <p className="text-2xl font-semibold">{q.validados_humanos}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Precisão</p>
        <p className="text-2xl font-semibold">{fmtPct(q.precisao)}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Confiança média</p>
        <p className="text-2xl font-semibold">{fmtPct(q.confianca_media)}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Melhoria</p>
        <p className={`text-2xl font-semibold ${q.melhoria_pct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {q.melhoria_pct >= 0 ? "+" : ""}{q.melhoria_pct.toFixed(1)}%
        </p>
      </Card>
    </div>
  );
}

// ─────────────────────────── Tab: Upload Manual ───────────────────────────
type Stage = "idle" | "uploading" | "ocr" | "ai" | "ready" | "saving" | "error";

function UploadTab({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedLearningFile | null>(null);
  const [extract, setExtract] = useState<ExtractedTextResult | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [aiResult, setAiResult] = useState<AiProcessStatus | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [classe, setClasse] = useState<string>("OUTRO");
  const [jsonOut, setJsonOut] = useState<Record<string, unknown>>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [stageMsg, setStageMsg] = useState<string>("");

  const reset = () => {
    setFile(null);
    setUploaded(null);
    setExtract(null);
    setOcrText("");
    setAiResult(null);
    setExtractionId(null);
    setClasse("OUTRO");
    setJsonOut({});
    setStage("idle");
    setProgress(0);
    setStageMsg("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error("Arquivo maior que 50 MB");
      return;
    }
    setFile(f);
    await runPipeline(f);
  };

  const runPipeline = async (f: File) => {
    try {
      // 1) upload
      setStage("uploading");
      setStageMsg("Enviando arquivo…");
      const up = await uploadLearningFile(f);
      setUploaded(up);

      // 2) OCR / extração
      setStage("ocr");
      setStageMsg("Extraindo texto…");
      let ext = await extractTextFromFile(f, up);

      if (ext.asyncOcrId) {
        setStageMsg("OCR longo em andamento (PDF grande)…");
        const final = await waitForOcr(ext.asyncOcrId, (s) => {
          setProgress(s.progress);
          setStageMsg(`OCR ${s.pages_processed ?? 0}/${s.pages_total ?? "?"} páginas (${s.progress}%)`);
        });
        ext = {
          ...ext,
          rawText: final.rawText,
          normalizedText: final.normalizedText,
          ocrConfidence: final.confidence,
          pageCount: final.pageCount,
        };
      }
      setExtract(ext);
      setOcrText(ext.normalizedText || ext.rawText);

      if (!ext.normalizedText && !ext.rawText) {
        throw new Error("Texto extraído está vazio");
      }

      // 3) IA
      setStage("ai");
      setStageMsg("Executando agentes (Classify → Router → Agente → Validador)…");
      const aiResp = await processWithAI({
        rawText: ext.rawText,
        normalizedText: ext.normalizedText,
        path: `/learning-docs/${up.path.split("/").slice(0, -1).join("/")}`,
        ocrConfidence: ext.ocrConfidence ?? undefined,
      });

      let final: AiProcessStatus;
      if ("data" in aiResp && aiResp.status === "completed") {
        final = {
          id: aiResp.id || "",
          status: "completed",
          progress: 100,
          classe: aiResp.classe,
          agent: aiResp.agent,
          extracted_data: aiResp.data,
          validation: aiResp.validation,
          valid: aiResp.validado,
          ocr_conf: aiResp.ocr_conf,
          ai_conf: aiResp.ai_conf,
          final_conf: aiResp.final_conf,
        } as AiProcessStatus;
      } else {
        const started = aiResp as { id: string };
        setStageMsg("IA em modo lote (texto longo)…");
        final = await waitForProcessing(started.id, (s) => {
          setProgress(s.progress);
          setStageMsg(`IA ${s.chunks_processed ?? 0}/${s.chunks_total ?? "?"} chunks (${s.progress}%)`);
        });
      }

      if (final.id) {
        setExtractionId(final.id);
        await markExtractionAsLearning(final.id, {
          path: up.path,
          mimeType: up.mimeType,
          fileName: up.fileName,
        });
      }
      setAiResult(final);
      if (final.classe) setClasse(final.classe);
      setJsonOut((final.extracted_data as Record<string, unknown>) || {});
      setStage("ready");
      setStageMsg("Pronto para validação");
      toast.success("Documento processado");
    } catch (er) {
      console.error(er);
      setStage("error");
      const msg = er instanceof Error ? er.message : String(er);
      setStageMsg(msg);
      toast.error(msg);
    }
  };

  const handleSave = async () => {
    if (!aiResult || !extractionId) {
      toast.error("Sem extração para validar");
      return;
    }
    setStage("saving");
    try {
      const result = await saveGroundTruth({
        extraction: {
          id: extractionId,
          document_id: null,
          prospecção_id: null,
          path: uploaded ? `learning-docs/${uploaded.path}` : null,
          classe,
          agent: aiResult.agent ?? null,
          raw_text: extract?.rawText ?? null,
          normalized_text: ocrText,
          extracted_data: (aiResult.extracted_data as Record<string, unknown>) ?? null,
          validation: aiResult.validation ?? null,
          final_confidence: aiResult.final_conf ?? null,
          ocr_confidence: aiResult.ocr_conf ?? null,
          ai_confidence: aiResult.ai_conf ?? null,
          valid: aiResult.valid ?? null,
          status: "completed",
          source: "learning",
          created_at: new Date().toISOString(),
        },
        correctedText: ocrText,
        correctedJson: jsonOut,
      });
      toast.success(`Salvo no dataset (${result.corrections_count} campo(s) corrigido(s))`);
      onSaved();
      reset();
    } catch (er) {
      const msg = er instanceof Error ? er.message : String(er);
      toast.error(`Erro ao salvar: ${msg}`);
      setStage("ready");
    }
  };

  const valuesToHighlight = useMemo(() => {
    return Object.values(jsonOut)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v));
  }, [jsonOut]);

  const busy = stage === "uploading" || stage === "ocr" || stage === "ai" || stage === "saving";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.csv,.txt,.log,.xlsx,.xls,.xlsm,application/pdf,image/*,text/*"
          onChange={onPick}
          className="hidden"
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
          <Upload className="w-4 h-4" /> Carregar documento
        </Button>
        {file && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              {detectFileKind(file) === "image" ? <ImageIcon className="w-3 h-3" /> :
               detectFileKind(file) === "spreadsheet" ? <Sheet className="w-3 h-3" /> :
               <FileText className="w-3 h-3" />}
              {file.name}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {(file.size / 1024).toFixed(0)} KB
            </span>
          </div>
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
            <Loader2 className="w-4 h-4 animate-spin" />
            {stageMsg} {progress > 0 && progress < 100 ? `· ${progress}%` : ""}
          </div>
        )}
        {stage === "ready" && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 ml-auto">
            <CheckCircle2 className="w-4 h-4" /> {stageMsg}
          </div>
        )}
        {stage === "error" && (
          <div className="flex items-center gap-2 text-sm text-red-700 ml-auto">
            <AlertTriangle className="w-4 h-4" /> {stageMsg}
          </div>
        )}
        {(stage === "ready" || stage === "error") && (
          <Button variant="ghost" size="sm" onClick={reset}>Limpar</Button>
        )}
      </Card>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna esquerda: documento */}
        <Card className="p-3 h-[640px] flex flex-col">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Documento
          </div>
          <div className="flex-1 bg-muted/30 rounded overflow-hidden flex items-center justify-center">
            <DocumentViewer url={uploaded?.publicUrl || null} mime={uploaded?.mimeType} kind={uploaded?.kind} />
          </div>
        </Card>

        {/* Coluna direita: OCR + JSON + Ações */}
        <div className="flex flex-col gap-4 h-[640px]">
          <Card className="p-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> OCR / Texto extraído (editável)
              </div>
              {extract?.ocrConfidence != null && (
                <Badge className={confColor(extract.ocrConfidence)}>
                  conf {fmtPct(extract.ocrConfidence)}
                </Badge>
              )}
            </div>
            <Textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="O OCR aparece aqui após o processamento…"
              className="flex-1 font-mono text-xs resize-none"
              disabled={busy}
            />
            {valuesToHighlight.length > 0 && ocrText && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer text-muted-foreground">Ver com highlight dos valores extraídos</summary>
                <div className="mt-2 p-2 bg-muted/40 rounded text-xs max-h-32 overflow-auto whitespace-pre-wrap leading-relaxed">
                  {highlightInText(ocrText, valuesToHighlight)}
                </div>
              </details>
            )}
          </Card>

          <Card className="p-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" /> JSON gerado pela IA (editável)
              </div>
              <div className="flex items-center gap-2">
                <Select value={classe} onValueChange={setClasse} disabled={busy}>
                  <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {aiResult?.final_conf != null && (
                  <Badge className={confColor(aiResult.final_conf)}>
                    final {fmtPct(aiResult.final_conf)}
                  </Badge>
                )}
              </div>
            </div>
            <SuspiciousFieldsAlert json={jsonOut} />
            <JsonEditor value={jsonOut} onChange={setJsonOut} className="flex-1 flex flex-col min-h-0 mt-2" />
            <div className="flex items-center gap-2 mt-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => aiResult && jsonOut && handleSave()}
                disabled={!aiResult || stage !== "ready"}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Marcar como correto
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!aiResult || stage !== "ready"}
              >
                <Save className="w-4 h-4 mr-1.5" /> Salvar correção
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Tab: Pendentes ───────────────────────────
function PendingTab() {
  const [items, setItems] = useState<LearningExtraction[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterClasse, setFilterClasse] = useState<string>("all");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [maxConf, setMaxConf] = useState<number>(0.85);
  const [selected, setSelected] = useState<LearningExtraction | null>(null);
  const [editText, setEditText] = useState("");
  const [editJson, setEditJson] = useState<Record<string, unknown>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPendingExtractions({
        classe: filterClasse === "all" ? null : filterClasse,
        onlyErrors,
        maxConfidence: maxConf,
      });
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterClasse, onlyErrors, maxConf]);

  useEffect(() => {
    if (selected) {
      setEditText(selected.normalized_text || selected.raw_text || "");
      setEditJson((selected.extracted_data as Record<string, unknown>) || {});
    }
  }, [selected]);

  const handleSave = async () => {
    if (!selected) return;
    try {
      const r = await saveGroundTruth({
        extraction: selected,
        correctedText: editText,
        correctedJson: editJson,
      });
      toast.success(`Validado · ${r.corrections_count} campo(s) corrigido(s)`);
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await markAsCorrect(selected);
      toast.success("Marcado como correto");
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Lista */}
      <Card className="p-3 lg:col-span-1 h-[680px] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Inbox className="w-4 h-4" /> Pendentes ({items.length})
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="space-y-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Classe</Label>
              <Select value={filterClasse} onValueChange={setFilterClasse}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Conf. máx</Label>
              <Input
                type="number" min={0} max={1} step={0.05}
                value={maxConf}
                onChange={(e) => setMaxConf(Number(e.target.value) || 0.85)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
            Apenas inválidos
          </label>
        </div>

        <ScrollArea className="flex-1 -mx-1">
          <div className="space-y-1 px-1">
            {items.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhuma extração pendente</p>
            )}
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => setSelected(it)}
                className={`w-full text-left p-2 rounded border text-xs transition-colors ${
                  selected?.id === it.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium truncate">{it.classe || "—"}</span>
                  <Badge className={confColor(it.final_confidence)} variant="secondary">
                    {fmtPct(it.final_confidence)}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {it.path || it.prospecção_id || it.id.slice(0, 8)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(it.created_at).toLocaleString("pt-BR")}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Editor */}
      <Card className="p-3 lg:col-span-2 h-[680px] flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Selecione uma extração para revisar
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm">{selected.classe} · {selected.agent}</h3>
                <p className="text-xs text-muted-foreground truncate max-w-[480px]">{selected.path || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={confColor(selected.ocr_confidence)} variant="secondary">OCR {fmtPct(selected.ocr_confidence)}</Badge>
                <Badge className={confColor(selected.ai_confidence)} variant="secondary">IA {fmtPct(selected.ai_confidence)}</Badge>
                <Badge className={confColor(selected.final_confidence)}>Final {fmtPct(selected.final_confidence)}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
              <div className="flex flex-col min-h-0">
                <Label className="text-xs mb-1">OCR (editável)</Label>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="font-mono text-xs flex-1 resize-none"
                />
              </div>
              <div className="flex flex-col min-h-0">
                <Label className="text-xs mb-1">JSON corrigido</Label>
                <SuspiciousFieldsAlert json={editJson} />
                <JsonEditor value={editJson} onChange={setEditJson} className="flex-1 flex flex-col min-h-0 mt-2" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={handleConfirm}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Marcar como correto
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1.5" /> Salvar correção
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────── Tab: Histórico (uploads de aprendizado) ───────────────────────────
function LearningHistoryTab() {
  const [items, setItems] = useState<LearningExtraction[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setItems(await listLearningExtractions()); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Documentos carregados para aprendizado ({items.length})</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {items.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhum documento carregado ainda.</p>
      )}
      <div className="divide-y">
        {items.map((it) => (
          <div key={it.id} className="py-2 grid grid-cols-12 items-center gap-2 text-sm">
            <div className="col-span-3 truncate">
              <span className="font-medium">{it.classe || "—"}</span>
              <span className="text-muted-foreground text-xs ml-2">{it.agent}</span>
            </div>
            <div className="col-span-5 truncate text-xs text-muted-foreground">{it.path}</div>
            <div className="col-span-2">
              <Badge className={confColor(it.final_confidence)} variant="secondary">{fmtPct(it.final_confidence)}</Badge>
            </div>
            <div className="col-span-2 text-right text-xs">
              {it.valid ? (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">validado</Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">pendente</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────── Página principal ───────────────────────────
export default function GestorIAAprendizado() {
  const navigate = useNavigate();
  const [quality, setQuality] = useState<QualityScore | null>(null);
  const loadQuality = async () => {
    try { setQuality(await getQualityScore()); }
    catch (e) { console.warn("quality:", e); }
  };
  useEffect(() => { loadQuality(); }, []);

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/gestor-ia")} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> Aprendizado de Documentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Carregue documentos para treinar os agentes ou valide extrações com baixa confiança vindas do pipeline.
            </p>
          </div>
        </div>

        <MetricsBar q={quality} />

        <Tabs defaultValue="upload" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upload" className="gap-2"><Upload className="w-4 h-4" /> Upload manual</TabsTrigger>
            <TabsTrigger value="pending" className="gap-2"><Inbox className="w-4 h-4" /> Pendentes do Prospeccao AJ</TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><FileText className="w-4 h-4" /> Histórico de aprendizado</TabsTrigger>
            <TabsTrigger value="quality" className="gap-2"><ShieldAlert className="w-4 h-4" /> Qualidade & Antifraude</TabsTrigger>
          </TabsList>
          <TabsContent value="upload"><UploadTab onSaved={loadQuality} /></TabsContent>
          <TabsContent value="pending"><PendingTab /></TabsContent>
          <TabsContent value="history"><LearningHistoryTab /></TabsContent>
          <TabsContent value="quality"><QualityFraudTab /></TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
}
