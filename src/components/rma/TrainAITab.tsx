// Aba "Treinar IA": 3 sub-tabs (Upload, OneDrive Pendentes, Colar JSON)
// Permite ao usuário criar gabaritos manuais que alimentam o pipeline de aprendizado.
import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Upload, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ExtractionEditor from "./training/ExtractionEditor";
import TrainingMetrics from "./training/TrainingMetrics";

interface Props {
  companyId: string | null;
  prospecçãoId?: string;
}

const CLASSES = [
  "BALANCETE", "DRE", "BS", "FLUXO_CAIXA",
  "NFE_COMPRAS", "NFE_VENDAS", "PIX", "BOLETO",
  "COMPROVANTE", "CONTRATO", "OFICIO", "OUTRO",
];

interface PendingDoc {
  extraction_id: string;
  document_id: string | null;
  path: string | null;
  classe: string | null;
  agent: string | null;
  final_confidence: number | null;
  status: string;
  extracted_data: any;
  noprospecçãolized_text: string | null;
  file_name: string | null;
}

export default function TrainAITab({ companyId, prospecçãoId }: Props) {
  const [classe, setClasse] = useState<string>("BALANCETE");
  const [agent, setAgent] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<any>({ linhas: [] });
  const [saving, setSaving] = useState(false);
  const [validatedCount, setValidatedCount] = useState<number | null>(null);
  const [agentQuality, setAgentQuality] = useState<number | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedPending, setSelectedPending] = useState<PendingDoc | null>(null);
  const [pasteJson, setPasteJson] = useState("");

  // ---- Carrega métricas do agente ativo ----
  const loadMetrics = useCallback(async () => {
    const agentName = agent || classe.toLowerCase();
    const { data: ap } = await supabase
      .from("agent_profiles")
      .select("quality_score, validation_count, priority_model")
      .eq("agent_name", agentName)
      .maybeSingle();
    if (ap) {
      setAgentQuality(Number((ap as any).quality_score ?? 0));
      setValidatedCount(Number((ap as any).validation_count ?? 0));
      setAgentModel((ap as any).priority_model ?? null);
    } else {
      setAgentQuality(null); setValidatedCount(0); setAgentModel(null);
    }
  }, [agent, classe]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  // ---- Lista docs pendentes ----
  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      let q = supabase.from("vw_training_pending").select("*").limit(50);
      if (prospecçãoId) q = q.eq("prospecção_id", prospecçãoId);
      const { data, error } = await q;
      if (error) throw error;
      setPending((data ?? []) as PendingDoc[]);
    } catch (e: any) {
      toast.error(`Erro ao carregar pendentes: ${e.message ?? e}`);
    } finally {
      setLoadingPending(false);
    }
  }, [prospecçãoId]);

  useEffect(() => { loadPending(); }, [loadPending]);

  // ---- Selecionar doc pendente ----
  const pickPending = (doc: PendingDoc) => {
    setSelectedPending(doc);
    setClasse((doc.classe || "OUTRO").toUpperCase());
    setAgent(doc.agent || (doc.classe || "outro").toLowerCase());
    setInputText(doc.noprospecçãolized_text || "");
    setOutput(doc.extracted_data || { linhas: [] });
    toast.info(`Carregado: ${doc.file_name ?? doc.path ?? doc.extraction_id.slice(0,8)}`);
  };

  // ---- Aplicar JSON colado ----
  const applyPastedJson = () => {
    try {
      const parsed = JSON.parse(pasteJson);
      setOutput(parsed);
      toast.success("JSON aplicado ao editor");
    } catch (e: any) {
      toast.error(`JSON inválido: ${e.message}`);
    }
  };

  // ---- Salvar gabarito ----
  const save = async () => {
    if (!inputText.trim()) { toast.error("Informe o texto do documento (input_text)"); return; }
    if (!output) { toast.error("Output vazio"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("training-save-example", {
        body: {
          classe,
          agent: agent || classe.toLowerCase(),
          input_text: inputText,
          output_correto: output,
          output_original: selectedPending?.extracted_data ?? null,
          extraction_id: selectedPending?.extraction_id ?? null,
          document_id: selectedPending?.document_id ?? null,
          prospecção_id: prospecçãoId ?? null,
          path: selectedPending?.path ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        `Gabarito salvo! Embedding: ${(data as any)?.embedding_ok ? "✓" : "✗"} · ` +
        `Qualidade agente: ${Math.round(((data as any)?.agent_profile?.quality ?? 0) * 100)}%`,
      );
      await loadMetrics();
      await loadPending();
      setSelectedPending(null);
      setOutput({ linhas: [] });
      setInputText("");
    } catch (e: any) {
      toast.error(`Falha ao salvar: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Treinar IA</h2>
        <p className="text-sm text-muted-foreground">
          Corrija extrações da IA para criar gabaritos. Cada exemplo validado vira few-shot automático
          em documentos parecidos e ajusta a configuração do agente.
        </p>
      </div>

      <TrainingMetrics
        validatedCount={validatedCount}
        agentQuality={agentQuality}
        agentModel={agentModel}
        agentName={agent || classe.toLowerCase()}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Origem do exemplo</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">
                <FileText className="h-3.5 w-3.5 mr-1" /> OneDrive ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="h-3.5 w-3.5 mr-1" /> Texto manual
              </TabsTrigger>
              <TabsTrigger value="json">JSON pronto</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Docs com baixa confiança ou erro {prospecçãoId ? "neste Prospecção" : ""}
                </span>
                <Button size="sm" variant="ghost" onClick={loadPending} disabled={loadingPending}>
                  {loadingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
                {pending.length === 0 && !loadingPending && (
                  <div className="p-4 text-center text-xs text-muted-foreground">Nenhum doc pendente.</div>
                )}
                {pending.map((p) => (
                  <button
                    key={p.extraction_id}
                    onClick={() => pickPending(p)}
                    className={`w-full text-left p-2 hover:bg-muted/50 flex items-center gap-2 ${
                      selectedPending?.extraction_id === p.extraction_id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.file_name ?? p.path ?? p.extraction_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.classe ?? "—"} · {p.agent ?? "—"}</div>
                    </div>
                    <Badge variant={p.status === "error" ? "destructive" : "secondary"} className="text-xs">
                      {p.final_confidence != null ? `${Math.round(p.final_confidence * 100)}%` : p.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-2 mt-3">
              <Label className="text-xs">Cole o texto OCR/transcrito do documento</Label>
              <textarea
                className="w-full min-h-32 border rounded p-2 font-mono text-xs"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Cole aqui o texto extraído do PDF/XLSX..."
              />
            </TabsContent>

            <TabsContent value="json" className="space-y-2 mt-3">
              <Label className="text-xs">JSON do gabarito (será aplicado ao editor abaixo)</Label>
              <textarea
                className="w-full min-h-32 border rounded p-2 font-mono text-xs"
                value={pasteJson}
                onChange={(e) => setPasteJson(e.target.value)}
                placeholder='{ "linhas": [ { "conta": "1.1.01", "descricao": "Caixa", "valor": 1500 } ] }'
              />
              <Button size="sm" onClick={applyPastedJson} disabled={!pasteJson.trim()}>Aplicar ao editor</Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gabarito (output esperado)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Classe</Label>
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Agente</Label>
              <Input
                value={agent}
                placeholder={classe.toLowerCase()}
                onChange={(e) => setAgent(e.target.value)}
              />
            </div>
          </div>

          <ExtractionEditor initial={output} onChange={setOutput} />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setOutput({ linhas: [] }); setSelectedPending(null); setInputText(""); }}>
              Descartar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar gabarito
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
