// Serviço para o fluxo Prospecção AJ (uploads, linhas, jobs).
import { supabase } from "@/lib/supabase-any";

export interface ProspeccaoLinha {
  id: string;
  id_servico: string | null;
  numero_processo: string | null;
  parte_con_nome: string | null;
  parte_con_cnpj: string | null;
  parte_con_qualif: string | null;
  parte_pro_nome: string | null;
  parte_pro_cnpj: string | null;
  denominacao: string | null;
  orgao_tribunal: string | null;
  esfera: string | null;
  instancia: string | null;
  uf: string | null;
  municipio: string | null;
  area_judicial: string | null;
  assunto_judicial: string | null;
  acao_judicial: string | null;
  valor_pleito: number | null;
  status_processo: string | null;
  dt_inicio: string | null;
  dt_cad_causa: string | null;
  processo_eletronico: boolean | null;
  link_documento: string | null;
  advogado_nome: string | null;
  advogado_oab: string | null;
  endereco_requerente: string | null;
  data_protocolo: string | null;
  pedidos_principais: string | null;
  ai_status: "pendente" | "baixado" | "extraido" | "erro" | "sem_link";
  ai_extracted: any | null;
  ai_error: string | null;
  // PARTE 5 — certificação e integração
  status_certificacao: StatusCertificacao;
  certificacao: Record<string, boolean> | null;
  mes_referencia: string | null;
  data_distribuicao: string | null;
  created_at: string;
}

export type StatusCertificacao =
  | "Em Processamento"
  | "Concluído"
  | "Revisão Manual"
  | "Erro OCR"
  | "Documento Duplicado"
  | "Documento Inválido";

export const STATUS_CERTIFICACAO: StatusCertificacao[] = [
  "Em Processamento",
  "Concluído",
  "Revisão Manual",
  "Erro OCR",
  "Documento Duplicado",
  "Documento Inválido",
];

export interface ProspeccaoLog {
  id: string;
  linha_id: string | null;
  modelo_gemini: string | null;
  tempo_ms: number | null;
  documento: string | null;
  resultado: string | null;
  created_at: string;
}

export async function listLinhas(): Promise<ProspeccaoLinha[]> {
  const { data, error } = await supabase
    .from("prospeccao_linhas" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as ProspeccaoLinha[]) || [];
}

export async function listLogs(limit = 50): Promise<ProspeccaoLog[]> {
  const { data, error } = await supabase
    .from("prospeccao_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ProspeccaoLog[]) || [];
}

export async function countByStatus(): Promise<{ total: number; pendentes: number; extraidos: number; erros: number }> {
  const { data, error } = await supabase
    .from("prospeccao_linhas" as never)
    .select("ai_status");
  if (error) throw error;
  const rows = (data as { ai_status: string }[]) || [];
  return {
    total: rows.length,
    pendentes: rows.filter(r => r.ai_status === "pendente" || r.ai_status === "baixado").length,
    extraidos: rows.filter(r => r.ai_status === "extraido").length,
    erros: rows.filter(r => r.ai_status === "erro").length,
  };
}

export async function uploadFile(file: File): Promise<{ upload_id: string; rows: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const file_type: "xlsx" | "csv" | "pdf" =
    ext === "pdf" ? "pdf" : ext === "csv" ? "csv" : "xlsx";

  const storage_path = `${user.id}/uploads/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await supabase.storage.from("prospeccao-uploads").upload(storage_path, file, { upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.functions.invoke("prospeccao-upload", {
    body: { storage_path, file_name: file.name, file_type },
  });
  if (error) throw error;
  return data as { upload_id: string; rows: number };
}

export async function processJobs(limit = 5): Promise<{ processed: number }> {
  const { data, error } = await supabase.functions.invoke("prospeccao-process-jobs", {
    body: { limit },
  });
  if (error) throw error;
  return data as { processed: number };
}
