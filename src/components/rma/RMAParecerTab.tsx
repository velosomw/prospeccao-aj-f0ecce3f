import { useState } from "react";
import DocumentSubStepNav from "./document/DocumentSubStepNav";
import RmaIntelligentEditor from "./document/RmaIntelligentEditor";
import RelatorioA4View from "./document/RelatorioA4View";
import { useParams } from "react-router-dom";
import { useRmaDocument } from "@/hooks/useRmaDocument";
import type { DocumentBlock, DocumentSubStep } from "@/types/documentEditor";

const ProspecçãoParecerTab = () => {
  const { id = "" } = useParams();
  const [subStep, setSubStep] = useState<DocumentSubStep>("escopo");
  const { sections, progresso, aprovadoPct, rules, canManualFinalize, regenerateFinal } = useRmaDocument(
    id,
    "parecer_tecnico",
    "Parecer Técnico Contábil",
  );

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
    ? `${aprovadoPct}% aprovado · pronto para gerar Parecer Técnico Final pericial.`
    : `${aprovadoPct}% aprovado · necessário ${rules.minPctManualFinal}% para emitir o Parecer Técnico Final (documento pericial exige aprovação do Coordenador).`;

  return (
    <div className="space-y-4">
      <DocumentSubStepNav
        activeStep={subStep}
        onStepChange={setSubStep}
        allCompleted={progresso === 100}
      />
      {subStep === "escopo" && (
        <RmaIntelligentEditor tipo="parecer_tecnico" titulo="Parecer Técnico Contábil" />
      )}
      {subStep === "relatorio" && (
        <RelatorioA4View
          documentTitle="PARECER TÉCNICO CONTÁBIL"
          documentSubtitle="Opinião pericial sobre demonstrativos, aderência ao Plano de Recuperação e riscos contábeis"
          blocks={blocks}
          onUpdateBlock={() => {}}
          onAddComment={() => {}}
          onFinalize={() => regenerateFinal(true)}
          finalLabel="Gerar Parecer Técnico Final (.docx)"
          finalDisabled={!canManualFinalize}
          finalHint={finalHint}
        />
      )}
    </div>
  );
};

export default ProspecçãoParecerTab;
