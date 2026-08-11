import { useState } from "react";
import DocumentSubStepNav from "./document/DocumentSubStepNav";
import RmaIntelligentEditor from "./document/RmaIntelligentEditor";
import RelatorioA4View from "./document/RelatorioA4View";
import { useParams } from "react-router-dom";
import { useProspeccaoDocument } from "@/hooks/useProspeccaoDocument";
import type { DocumentBlock, DocumentSubStep } from "@/types/documentEditor";

const ProspeccaoRelatorioTab = () => {
  const { id = "" } = useParams();
  const [subStep, setSubStep] = useState<DocumentSubStep>("escopo");
  const { sections, progresso, aprovadoPct, rules, canManualFinalize, regenerateFinal } = useProspeccaoDocument(
    id,
    "prospeccao_mensal",
    "Revisão-Relatório Prospeccao Mensal (CNJ 72/2020)",
  );
  // Nota: progresso/status do documento são recalculados automaticamente
  // pelo trigger trg_prospeccao_section_autosync sempre que uma seção muda.
  // O .docx Final é regenerado em tempo real via setStatus → regenerateFinal.

  const blocks: DocumentBlock[] = sections.map((s) => ({
    id: s.id,
    title: `${s.numero ? s.numero + " " : ""}${s.titulo}`,
    content: s.conteudo_editado || s.conteudo_ia || "",
    status:
      s.status === "concluido" || s.status === "aprovado"
        ? "completed"
        : s.status === "revisado" || s.status === "em_edicao"
          ? "in_review"
          : "pending",
    version: s.versao_atual,
    comments: [],
  }));

  const finalHint = canManualFinalize
    ? `${aprovadoPct}% aprovado · Prospeccao Final pode ser emitido com dados parciais e atualizado incrementalmente.`
    : `${aprovadoPct}% aprovado · necessário ${rules.minPctManualFinal}% para emitir o Prospeccao Final (relatório de acompanhamento mensal).`;

  return (
    <div className="space-y-4">
      <DocumentSubStepNav
        activeStep={subStep}
        onStepChange={setSubStep}
        allCompleted={progresso === 100}
      />
      {subStep === "escopo" && (
        <RmaIntelligentEditor tipo="prospeccao_mensal" titulo="Revisão-Relatório Prospeccao Mensal (CNJ 72/2020)" />
      )}
      {subStep === "relatorio" && (
        <RelatorioA4View
          documentTitle="RELATÓRIO MENSAL DE ATIVIDADES (Prospeccao)"
          documentSubtitle="Recomendação CNJ 72/2020 — Acompanhamento mensal da Administração Judicial"
          blocks={blocks}
          onUpdateBlock={() => {}}
          onAddComment={() => {}}
          onFinalize={() => regenerateFinal(true)}
          finalLabel="Gerar Prospeccao Final (.docx)"
          finalDisabled={!canManualFinalize}
          finalHint={finalHint}
        />
      )}
    </div>
  );
};

export default ProspeccaoRelatorioTab;
