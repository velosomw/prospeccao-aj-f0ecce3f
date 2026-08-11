// Diagnóstico end-to-end do pipeline ai-full-process
// Fluxo: cria pipeline_document sintético → injeta ocr_results pronto → invoca ai-full-process
// → re-consulta KPIs e compara antes/depois.
import { supabase } from "@/lib/supabase-any";
import { getGestorKpis, type GestorKpis } from "./gestorKpisService";

export interface DiagnosticStep {
  name: string;
  status: "pending" | "running" | "ok" | "fail";
  detail?: string;
  duration_ms?: number;
}

export interface DiagnosticResult {
  success: boolean;
  steps: DiagnosticStep[];
  before: GestorKpis;
  after: GestorKpis;
  extraction_id?: string;
  quality_score?: number;
  document_id?: string;
}

const SYNTHETIC_OCR = `BALANÇO PATRIMONIAL — TESTE DIAGNÓSTICO PIPELINE
Empresa: BEx Diagnóstico LTDA
CNPJ: 00.000.000/0001-00
Período: 31/12/2024

ATIVO CIRCULANTE
Caixa e Equivalentes ............... R$ 150.000,00
Contas a Receber ................... R$ 320.000,00
Estoques ........................... R$ 180.000,00
Total Ativo Circulante ............. R$ 650.000,00

ATIVO NÃO CIRCULANTE
Imobilizado ........................ R$ 850.000,00
Total Ativo ........................ R$ 1.500.000,00

PASSIVO + PL
Fornecedores ....................... R$ 280.000,00
Empréstimos ........................ R$ 420.000,00
Patrimônio Líquido ................. R$ 800.000,00
Total Passivo + PL ................. R$ 1.500.000,00`;

export async function runPipelineDiagnostic(
  onStep?: (steps: DiagnosticStep[]) => void,
): Promise<DiagnosticResult> {
  const steps: DiagnosticStep[] = [
    { name: "KPIs (antes)", status: "pending" },
    { name: "Criar documento sintético", status: "pending" },
    { name: "Injetar OCR pronto", status: "pending" },
    { name: "Invocar ai-full-process", status: "pending" },
    { name: "Validar persistência (ai_extractions)", status: "pending" },
    { name: "KPIs (depois) — atualização", status: "pending" },
  ];
  const update = (i: number, patch: Partial<DiagnosticStep>) => {
    steps[i] = { ...steps[i], ...patch };
    onStep?.([...steps]);
  };

  const t0 = Date.now();
  let before: GestorKpis;
  try {
    update(0, { status: "running" });
    before = await getGestorKpis();
    update(0, { status: "ok", detail: `runs=${before.total_runs}`, duration_ms: Date.now() - t0 });
  } catch (e) {
    update(0, { status: "fail", detail: errMsg(e) });
    throw e;
  }

  // 1+2) cria pipeline_document + injeta OCR via edge function (service_role)
  // Necessário porque RLS de pipeline_documents/ocr_results exige gestor_ia/coordenador.
  let documentId: string;
  const t1 = Date.now();
  try {
    update(1, { status: "running" });
    const { data, error } = await supabase.functions.invoke(
      "pipeline-diagnostic-seed",
      { body: {} },
    );
    if (error) throw error;
    if (!data?.document_id) throw new Error(data?.error || "Sem document_id");
    documentId = data.document_id;
    update(1, {
      status: "ok",
      detail: `id=${documentId.slice(0, 8)}…`,
      duration_ms: Date.now() - t1,
    });
    update(2, { status: "ok", detail: "OCR sintético injetado via edge" });
  } catch (e) {
    update(1, { status: "fail", detail: errMsg(e) });
    throw e;
  }

  // 3) ai-full-process
  let extractionId: string | undefined;
  let qualityScore: number | undefined;
  const t3 = Date.now();
  try {
    update(3, { status: "running" });
    const { data, error } = await supabase.functions.invoke("ai-full-process", {
      body: { document_id: documentId },
    });
    if (error) throw error;
    if (!data || data.error) throw new Error(data?.error || "Resposta vazia");
    extractionId = data.extraction_id;
    qualityScore = data.quality_score;
    update(3, {
      status: "ok",
      detail: `quality=${(qualityScore ?? 0).toFixed(2)} · ${data.quality_action}`,
      duration_ms: Date.now() - t3,
    });
  } catch (e) {
    update(3, { status: "fail", detail: errMsg(e) });
    throw e;
  }

  // 4) valida persistência
  const t4 = Date.now();
  try {
    update(4, { status: "running" });
    const { data, error } = await supabase
      .from("ai_extractions")
      .select("id,status,quality_score,ai_confidence,validation_score")
      .eq("id", extractionId!)
      .single();
    if (error) throw error;
    if (!data) throw new Error("Extração não encontrada");
    update(4, {
      status: "ok",
      detail: `status=${data.status} · ai_conf=${Number(data.ai_confidence ?? 0).toFixed(2)}`,
      duration_ms: Date.now() - t4,
    });
  } catch (e) {
    update(4, { status: "fail", detail: errMsg(e) });
    throw e;
  }

  // 5) KPIs depois
  const t5 = Date.now();
  let after: GestorKpis;
  try {
    update(5, { status: "running" });
    after = await getGestorKpis();
    const grew = after.total_runs > before.total_runs;
    const distChanged =
      JSON.stringify(after.accuracy_distribution) !==
      JSON.stringify(before.accuracy_distribution);
    if (!grew) {
      update(5, {
        status: "fail",
        detail: `runs não cresceu (${before.total_runs} → ${after.total_runs})`,
        duration_ms: Date.now() - t5,
      });
      throw new Error("KPIs não foram atualizados");
    }
    update(5, {
      status: "ok",
      detail: `runs ${before.total_runs}→${after.total_runs} · gráfico ${distChanged ? "atualizado" : "estável"}`,
      duration_ms: Date.now() - t5,
    });
  } catch (e) {
    if (steps[5].status !== "fail") update(5, { status: "fail", detail: errMsg(e) });
    throw e;
  }

  return {
    success: steps.every((s) => s.status === "ok"),
    steps,
    before,
    after,
    extraction_id: extractionId,
    quality_score: qualityScore,
    document_id: documentId,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
