import { CheckCircle2, ShieldCheck, FileCheck, Award, FileText, Download, FileSpreadsheet, Package, ArrowRight } from "lucide-react";
import ProspeccaoRelatorioFinalTab from "@/components/prospeccao/ProspeccaoRelatorioFinalTab";
import { useState } from "react";

interface Props {
  scoreFinal: number;
  conformidade: number;
  pendencias: number;
  documentosTotal: number;
  documentosValidados: number;
  responsavel?: string;
}

export default function StageFechamento({
  scoreFinal, conformidade, pendencias, documentosTotal, documentosValidados, responsavel = "—",
}: Props) {
  const [showReport, setShowReport] = useState(false);

  const scoreColor =
    scoreFinal < 33 ? { ring: "hsl(0,84%,60%)", label: "RISCO ALTO" } :
    scoreFinal < 67 ? { ring: "hsl(38,92%,50%)", label: "RISCO MÉDIO" } :
    { ring: "hsl(142,76%,36%)", label: "RISCO BAIXO" };

  const pronto = pendencias === 0 && documentosValidados === documentosTotal && documentosTotal > 0;

  return (
    <div className="space-y-4">
      {/* Banner — só mostra "pronto" quando realmente está pronto */}
      {pronto ? (
        <div className="bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-[hsl(142,76%,36%)] flex-shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-foreground">Relatório pronto para aprovação e assinatura.</span>
            <span className="text-muted-foreground"> Todas as pendências foram resolvidas ou justificadas.</span>
          </div>
          <button
            onClick={() => setShowReport(true)}
            className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,32%)] text-white text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Prévia do Relatório
          </button>
        </div>
      ) : null}

      {/* 5 cards finais */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Score Final */}
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Prospeccao AJ Score Final</h3>
          <div className="text-4xl font-bold" style={{ color: scoreColor.ring }}>{Math.round(scoreFinal)}</div>
          <div className="text-[10px] font-bold mt-1" style={{ color: scoreColor.ring }}>{scoreColor.label}</div>
          <div className="text-[10px] text-muted-foreground mt-2">Score consolidado</div>
        </div>
        {/* Conformidade */}
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conformidade</h3>
          <ShieldCheck className="w-7 h-7 text-[hsl(217,91%,50%)] mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground">{Math.round(conformidade)}%</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {conformidade >= 80 ? "Dentro do esperado" : conformidade >= 50 ? "Atenção" : "Crítico"}
          </div>
        </div>
        {/* Pendências */}
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pendências</h3>
          {pendencias === 0 ? (
            <CheckCircle2 className="w-7 h-7 text-[hsl(142,76%,36%)] mx-auto mb-1" />
          ) : (
            <FileCheck className="w-7 h-7 text-[hsl(38,92%,50%)] mx-auto mb-1" />
          )}
          <div className="text-2xl font-bold text-foreground">{pendencias}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {pendencias === 0 ? "Todas tratadas" : "Aguardando resolução"}
          </div>
        </div>
        {/* Documentos */}
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Documentos</h3>
          <FileCheck className="w-7 h-7 text-[hsl(217,91%,50%)] mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground">{documentosValidados}/{documentosTotal}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Validados</div>
        </div>
        {/* Validações IA — derivado de conformidade real */}
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Validações IA</h3>
          <Award className="w-7 h-7 text-[hsl(258,90%,56%)] mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground">{Math.round(conformidade)}%</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {conformidade >= 100 ? "Concluídas" : "Em andamento"}
          </div>
        </div>
      </div>



      {/* Relatório expandido */}
      {showReport && (
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground">Relatório Prospeccao AJ Final</h3>
            <button onClick={() => setShowReport(false)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
          </div>
          <ProspeccaoRelatorioFinalTab />
        </div>
      )}
    </div>
  );
}
