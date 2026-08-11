import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getRmaDocRules } from "@/lib/prospeccaoDocumentRules";

export type SectionStatus =
  | "pendente"
  | "em_edicao"
  | "revisado"
  | "aprovado"
  | "concluido";

export type DocumentStatus = "rascunho" | "em_producao" | "pre_parecer" | "finalizado";

export interface RmaDocSection {
  id: string;
  document_id: string;
  parent_id: string | null;
  ordem: number;
  numero: string | null;
  titulo: string;
  conteudo_ia: string | null;
  conteudo_editado: string | null;
  prompt_contexto: string | null;
  status: SectionStatus;
  assigned_to: "usuario" | "coordenador" | null;
  versao_atual: number;
  tokens_usados: number | null;
  grounding_score?: number | null;
  ungrounded_claims?: any;
  graficos_ids?: any;
  kpis?: any;
  chart_meta?: any;
  regen_count?: number | null;
}

export interface RmaDocComment {
  id: string;
  section_id: string;
  author_name: string | null;
  author_role: string | null;
  text: string;
  resolved: boolean;
  created_at: string;
}

export interface RmaDocument {
  id: string;
  prospeccao_id: string;
  tipo: string;
  titulo: string;
  status: DocumentStatus;
  progresso: number;
  arquivo_final_url?: string | null;
  arquivo_final_versao?: number | null;
  arquivo_final_gerado_em?: string | null;
  arquivo_final_pct?: number | null;
}

export function useRmaDocument(prospeccaoId: string, tipo: "parecer_tecnico" | "prospeccao_mensal", titulo: string) {
  const [doc, setDoc] = useState<RmaDocument | null>(null);
  const [sections, setSections] = useState<RmaDocSection[]>([]);
  const [comments, setComments] = useState<Record<string, RmaDocComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);

  const initDoc = useCallback(async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("prospeccao_documents")
        .select("*")
        .eq("prospeccao_id", prospeccaoId)
        .eq("tipo", tipo)
        .neq("status", "finalizado")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let documentId: string;
      if (existing) {
        documentId = existing.id;
        setDoc(existing as any);
      } else {
        const { data, error } = await supabase.functions.invoke("prospeccao-doc-init", {
          body: { prospeccao_id: prospeccaoId, tipo, titulo },
        });
        if (error) throw error;
        documentId = data.document_id;
        const { data: created } = await supabase
          .from("prospeccao_documents")
          .select("*")
          .eq("id", documentId)
          .maybeSingle();
        setDoc(created as any);
      }

      const { data: secs } = await supabase
        .from("prospeccao_document_sections")
        .select("*")
        .eq("document_id", documentId)
        .order("ordem", { ascending: true });
      setSections((secs || []) as any);

      const ids = (secs || []).map((s: any) => s.id);
      if (ids.length) {
        const { data: cs } = await supabase
          .from("prospeccao_document_section_comments")
          .select("*")
          .in("section_id", ids)
          .order("created_at", { ascending: true });
        const grouped: Record<string, RmaDocComment[]> = {};
        (cs || []).forEach((c: any) => {
          (grouped[c.section_id] ||= []).push(c);
        });
        setComments(grouped);
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar documento", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [prospeccaoId, tipo, titulo]);

  useEffect(() => {
    initDoc();
  }, [initDoc]);

  const reloadSection = async (sectionId: string) => {
    const { data } = await supabase
      .from("prospeccao_document_sections")
      .select("*")
      .eq("id", sectionId)
      .maybeSingle();
    if (data) setSections((prev) => prev.map((s) => (s.id === sectionId ? (data as any) : s)));
  };

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const generateAllSections = useCallback(async () => {
    const pending = sections.filter(
      (s) => !s.conteudo_ia && !s.conteudo_editado,
    );
    if (!pending.length) {
      toast({ title: "Todas as seções já possuem conteúdo IA" });
      return;
    }
    setBulkGenerating(true);
    setBulkProgress({ done: 0, total: pending.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < pending.length; i++) {
      const s = pending[i];
      try {
        const { error } = await supabase.functions.invoke("prospeccao-doc-section-ai", {
          body: { section_id: s.id, mode: "generate" },
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        console.error("bulk-gen erro seção", s.id, e);
        fail++;
      }
      setBulkProgress({ done: i + 1, total: pending.length });
    }
    // recarrega tudo
    const { data: secs } = await supabase
      .from("prospeccao_document_sections")
      .select("*")
      .eq("document_id", sections[0]?.document_id)
      .order("ordem", { ascending: true });
    if (secs) setSections(secs as any);
    setBulkGenerating(false);
    setBulkProgress(null);
    toast({
      title: "Geração em massa concluída",
      description: `${ok} seções geradas${fail ? ` · ${fail} falharam` : ""}.`,
      variant: fail ? "destructive" : "default",
    });
  }, [sections]);

  const generateSection = async (sectionId: string, mode: "generate" | "rewrite", extra = "") => {
    setBusySectionId(sectionId);
    try {
      const { data, error } = await supabase.functions.invoke("prospeccao-doc-section-ai", {
        body: { section_id: sectionId, mode, extra_instructions: extra },
      });
      if (error) throw error;
      await reloadSection(sectionId);
      toast({ title: mode === "rewrite" ? "Seção refeita pela IA" : "Seção gerada pela IA" });
      return data;
    } catch (e: any) {
      toast({ title: "Erro IA", description: e.message, variant: "destructive" });
    } finally {
      setBusySectionId(null);
    }
  };

  const regenerateWithFeedback = async (sectionId: string, extra = "") => {
    setBusySectionId(sectionId);
    try {
      const { data, error } = await supabase.functions.invoke("prospeccao-doc-section-regenerate", {
        body: { section_id: sectionId, extra_instructions: extra },
      });
      if (error) throw error;
      await reloadSection(sectionId);
      toast({
        title: "Seção regerada",
        description: `Grounding ${data?.grounding_score ?? 0}/100 · ${data?.sources_count ?? 0} fontes · ${data?.comments_used ?? 0} comentário(s) considerado(s)`,
      });
      return data;
    } catch (e: any) {
      toast({ title: "Erro ao regerar", description: e.message, variant: "destructive" });
    } finally {
      setBusySectionId(null);
    }
  };


  const updateContent = async (sectionId: string, conteudo: string, status?: SectionStatus) => {
    const patch: any = { conteudo_editado: conteudo };
    if (status) patch.status = status;
    const { error } = await supabase.from("prospeccao_document_sections").update(patch).eq("id", sectionId);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    // versão manual
    await supabase.from("prospeccao_document_section_versions").insert({
      section_id: sectionId,
      versao: (sections.find((s) => s.id === sectionId)?.versao_atual ?? 1) + 1,
      conteudo,
      origem: "editor_manual",
    });
    await reloadSection(sectionId);
  };

  const regenerateFinal = useCallback(
    async (force = false) => {
      if (!doc) return null;
      const { data, error } = await supabase.functions.invoke("prospeccao-doc-consolidate-docx", {
        body: { document_id: doc.id, force },
      });
      if (error) {
        toast({ title: "Erro ao gerar .docx", description: error.message, variant: "destructive" });
        return null;
      }
      if (data?.skipped) {
        if (force) toast({ title: "Documento ainda incompleto", description: data.reason });
        return null;
      }
      if (data?.ok) {
        const rules = getRmaDocRules(tipo);
        toast({
          title: `${rules.finalLabel} atualizado`,
          description: `Versão ${data.versao} · ${data.pct}% concluído`,
        });
        // recarrega doc com nova URL
        const { data: updated } = await supabase
          .from("prospeccao_documents")
          .select("*")
          .eq("id", doc.id)
          .maybeSingle();
        if (updated) setDoc(updated as any);
      }
      return data;
    },
    [doc],
  );

  const buildCharts = useCallback(async (force = false) => {
    if (!doc) return null;
    const { data, error } = await supabase.functions.invoke("prospeccao-doc-charts-build", {
      body: { document_id: doc.id, months: 12, force },
    });
    if (error) {
      toast({ title: "Erro ao gerar gráficos", description: error.message, variant: "destructive" });
      return null;
    }
    toast({
      title: "KPIs e gráficos gerados",
      description: `${data?.charts_count ?? 0} gráficos · ${data?.kpis_count ?? 0} KPIs · ${data?.sections_updated ?? 0} seções atualizadas`,
    });
    await initDoc();
    return data;
  }, [doc, initDoc]);

  const setStatus = async (sectionId: string, status: SectionStatus, motivo?: string) => {
    const { error } = await supabase.rpc("transition_prospeccao_section_status", {
      p_section_id: sectionId,
      p_new_status: status,
      p_motivo: motivo ?? null,
    });
    if (error) {
      toast({ title: "Transição bloqueada", description: error.message, variant: "destructive" });
      return false;
    }
    await reloadSection(sectionId);

    // Auto-trigger geração do .docx quando atingir limiar (90%)
    // Calcula sobre o estado pós-transição
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, status } : s,
    );
    const total = updated.length;
    const ok = updated.filter((s) => s.status === "aprovado" || s.status === "concluido").length;
    const pct = total ? Math.round((ok * 100) / total) : 0;
    const rules = getRmaDocRules(tipo);
    if (pct >= rules.minPctAutoFinal) {
      // não bloqueia o fluxo
      regenerateFinal(false).catch(() => {});
    }
    return true;
  };

  const consolidate = async (documentId: string) => {
    const { data, error } = await supabase.rpc("consolidate_prospeccao_document", { p_document_id: documentId });
    if (error) {
      toast({ title: "Consolidação bloqueada", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Documento consolidado" });
    await initDoc();
    await regenerateFinal(true);
    return data;
  };

  const assignTo = async (sectionId: string, target: "usuario" | "coordenador") => {
    await supabase.from("prospeccao_document_sections").update({ assigned_to: target }).eq("id", sectionId);
    await reloadSection(sectionId);
  };

  const addComment = async (sectionId: string, text: string) => {
    const { data: u } = await supabase.auth.getUser();
    const meta = u.user?.user_metadata as any;
    const insert = {
      section_id: sectionId,
      author_id: u.user?.id,
      author_name: meta?.full_name || u.user?.email || "Usuário",
      author_role: meta?.role || "Consultor",
      text,
    };
    const { data } = await supabase.from("prospeccao_document_section_comments").insert(insert).select().single();
    if (data) setComments((prev) => ({ ...prev, [sectionId]: [...(prev[sectionId] || []), data as any] }));
  };

  const progresso = sections.length
    ? Math.round((sections.filter((s) => s.status === "concluido").length / sections.length) * 100)
    : 0;

  const aprovadoPct = sections.length
    ? Math.round(
        (sections.filter((s) => s.status === "aprovado" || s.status === "concluido").length /
          sections.length) *
          100,
      )
    : 0;

  const rules = getRmaDocRules(tipo);
  const canManualFinalize = aprovadoPct >= rules.minPctManualFinal;
  const canAutoFinalize = aprovadoPct >= rules.minPctAutoFinal;

  return {
    doc,
    sections,
    comments,
    loading,
    busySectionId,
    bulkGenerating,
    bulkProgress,
    progresso,
    aprovadoPct,
    rules,
    canManualFinalize,
    canAutoFinalize,
    generateSection,
    regenerateWithFeedback,
    buildCharts,
    generateAllSections,
    updateContent,
    setStatus,
    consolidate,
    regenerateFinal,
    assignTo,
    addComment,
    reload: initDoc,
  };
}
