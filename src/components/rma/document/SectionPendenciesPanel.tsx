import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileSearch, CheckCircle2, BookOpen } from "lucide-react";

interface SectionRow {
  id: string;
  numero: string | null;
  titulo: string;
  conteudo_editado: string | null;
  conteudo_ia: string | null;
  status: string;
  grounding_score: number | null;
  ungrounded_claims: any;
}

interface TemplateNode {
  numero?: string;
  titulo?: string;
  prompt?: string;
  data_source?: string;
  evidence_sources?: string[];
  children?: TemplateNode[];
}

interface Props {
  documentId: string;
  tipo: string; // e.g. "rma_intelligence"
  sections: SectionRow[];
}

// Mapa de "fonte canônica" (onde o auditor encontra a evidência no documento de referência DIP/Capital AJ).
// Mantém a string curta e auditável, sem inventar números fora do modelo.
const SOURCE_HINTS: Record<string, string> = {
  "companies": "Cadastro da Recuperanda (Workspace › Cadastros › Empresa)",
  "ai_extractions": "Documentos extraídos pela IA (Workspace › Dados & Upload)",
  "balancete_consolidado": "Balancete consolidado (Workspace › Balancetes)",
  "bs_consolidado": "Balanço Patrimonial (Workspace › Balanço)",
  "dre_consolidado": "DRE (Workspace › DRE)",
  "fluxo_caixa_consolidado": "Fluxo de Caixa (Workspace › Fluxo de Caixa)",
  "lancamentos": "Lançamentos contábeis (Workspace › Razão)",
  "nfe_compras": "Notas Fiscais (Workspace › NF-e)",
  "rma_cobrancas": "Cobranças/Aging (Workspace › Aging)",
  "rma_analysis_results": "Análise consolidada do RMA",
  "company.profile": "Cadastro da empresa (CNPJ, CNAE, atividade)",
  "company.societaria": "Estrutura societária (atas, contratos sociais)",
};

const flattenTemplate = (nodes: TemplateNode[] | undefined, acc: TemplateNode[] = []): TemplateNode[] => {
  if (!Array.isArray(nodes)) return acc;
  for (const n of nodes) {
    acc.push(n);
    if (n.children?.length) flattenTemplate(n.children, acc);
  }
  return acc;
};

export const SectionPendenciesPanel = ({ documentId, tipo, sections }: Props) => {
  const [template, setTemplate] = useState<TemplateNode[]>([]);
  const [evidenceCounts, setEvidenceCounts] = useState<Record<string, number>>({});
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [tpl, evs, srcs] = await Promise.all([
        supabase.from("rma_document_templates").select("structure").eq("tipo", tipo).maybeSingle(),
        supabase.from("rma_section_evidences").select("section_id").eq("document_id", documentId),
        supabase
          .from("rma_section_data_sources")
          .select("section_id")
          .in("section_id", sections.map((s) => s.id).filter(Boolean)),
      ]);
      if (cancelled) return;
      const structure: any = (tpl.data as any)?.structure || {};
      setTemplate(flattenTemplate(structure?.sections));
      const evMap: Record<string, number> = {};
      (evs.data || []).forEach((r: any) => { evMap[r.section_id] = (evMap[r.section_id] || 0) + 1; });
      setEvidenceCounts(evMap);
      const srcMap: Record<string, number> = {};
      (srcs.data || []).forEach((r: any) => { srcMap[r.section_id] = (srcMap[r.section_id] || 0) + 1; });
      setSourceCounts(srcMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [documentId, tipo, sections.length]);

  const templateByNumero = useMemo(() => {
    const m: Record<string, TemplateNode> = {};
    template.forEach((n) => { if (n.numero) m[n.numero] = n; });
    return m;
  }, [template]);

  const rows = useMemo(() => {
    return sections.map((s) => {
      const tplNode = (s.numero && templateByNumero[s.numero]) || {};
      const evidenceSources = tplNode.evidence_sources || (tplNode.data_source ? [tplNode.data_source] : []);
      const hasContent = !!(s.conteudo_editado || s.conteudo_ia);
      const evCount = evidenceCounts[s.id] || 0;
      const srcCount = sourceCounts[s.id] || 0;
      const ung = Array.isArray(s.ungrounded_claims) ? s.ungrounded_claims : [];
      const score = s.grounding_score ?? 0;

      const missing: string[] = [];
      if (!hasContent) missing.push("Sem conteúdo gerado pela IA — documento-fonte ausente no workspace.");
      if (evCount === 0) missing.push("Nenhuma evidência ancorada (rma_section_evidences vazia).");
      if (srcCount === 0 && evidenceSources.length > 0) missing.push("Nenhuma fonte de dados conciliada para esta seção.");
      if (score < 50 && hasContent) missing.push(`Grounding baixo (${score}/100) — revisar fontes.`);
      if (ung.length > 0) missing.push(`${ung.length} valor(es) sem origem identificada: ${ung.slice(0, 4).join(" · ")}${ung.length > 4 ? " …" : ""}`);

      return {
        id: s.id,
        numero: s.numero,
        titulo: s.titulo,
        ok: missing.length === 0,
        missing,
        expectedSources: evidenceSources,
        promptRef: tplNode.prompt,
      };
    });
  }, [sections, templateByNumero, evidenceCounts, sourceCounts]);

  const pending = rows.filter((r) => !r.ok);

  if (loading) {
    return <p className="text-xs text-muted-foreground py-4">Calculando pendências por seção…</p>;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-amber-600" />
          Pendências por Seção do DOCX
          <Badge variant="outline" className="ml-1 text-[10px]">
            {pending.length}/{rows.length} com pendência
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Todas as seções têm conteúdo, evidências e fontes conciliadas.
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-md border bg-amber-50/40 p-2 text-xs">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-foreground">
                    {r.numero ? `${r.numero} ` : ""}{r.titulo}
                  </p>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] gap-1 shrink-0">
                    <AlertTriangle className="w-3 h-3" /> Pendente
                  </Badge>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-900">
                  {r.missing.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
                {r.expectedSources.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-amber-200/60">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-0.5">
                      <BookOpen className="w-3 h-3" /> Onde encontrar no workspace
                    </p>
                    <ul className="space-y-0.5">
                      {r.expectedSources.map((src) => (
                        <li key={src} className="text-muted-foreground">
                          <span className="font-mono text-[10px] text-foreground">{src}</span>
                          {SOURCE_HINTS[src] && <> — {SOURCE_HINTS[src]}</>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.promptRef && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">
                    Referência do modelo: {r.promptRef}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default SectionPendenciesPanel;
