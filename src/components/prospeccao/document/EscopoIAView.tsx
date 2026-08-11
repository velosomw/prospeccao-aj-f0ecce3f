import { useState } from "react";
import { FileText, Sparkles, Brain, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DocumentBlock } from "@/types/documentEditor";

interface Props {
  title: string;
  blocks: DocumentBlock[];
  onAdvance: () => void;
}

interface AIInsight {
  status: "aderente" | "atencao" | "informativo";
  summary: string;
  detail: string;
}

const generateInsight = (block: DocumentBlock, index: number): AIInsight | null => {
  const statuses: AIInsight["status"][] = ["aderente", "atencao", "informativo"];
  const status = statuses[index % 3];

  const map: Record<AIInsight["status"], { summary: string; detail: string }> = {
    aderente: {
      summary: "Parâmetros aderentes",
      detail: `O tópico "${block.title}" atende aos critérios técnicos e noprospeccaotivos aplicáveis. As fontes documentais utilizadas são consistentes com os dados processados pela plataforma.`,
    },
    atencao: {
      summary: "Requer validação adicional",
      detail: `O tópico "${block.title}" apresenta elementos que necessitam de validação cruzada com documentos complementares. Recomenda-se revisão dos parâmetros antes da aprovação.`,
    },
    informativo: {
      summary: "Contexto técnico aplicado",
      detail: `O tópico "${block.title}" foi formulado com base nas noprospecções NBC TA vigentes e dados extraídos via OCR. Os indicadores utilizados seguem os padrões de análise da plataforma.`,
    },
  };

  return { status, ...map[status] };
};

const statusStyles: Record<AIInsight["status"], { bg: string; text: string; icon: React.ElementType; label: string }> = {
  aderente: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2, label: "Aderente" },
  atencao: { bg: "bg-amber-500/10", text: "text-amber-400", icon: AlertTriangle, label: "Atenção" },
  informativo: { bg: "bg-sky-500/10", text: "text-sky-400", icon: Info, label: "Informativo" },
};

const EscopoIAView = ({ title, blocks, onAdvance }: Props) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  const selectedIndex = blocks.findIndex(b => b.id === selectedBlockId);
  const insight = selectedBlock ? generateInsight(selectedBlock, selectedIndex) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* Left – Escopo blocks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(258,90%,56%)]" />
              Escopo Gerado por IA
            </CardTitle>
            <Badge className="bg-[hsl(258,90%,56%)]/15 text-[hsl(258,90%,56%)] border-0 text-xs">
              Gerado automaticamente
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Projeto: {title}</p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-4 pr-4">
              {blocks.map((block, i) => (
                <div
                  key={block.id}
                  onClick={() => setSelectedBlockId(prev => prev === block.id ? null : block.id)}
                  className={`border rounded-lg p-5 transition-colors cursor-pointer ${
                    selectedBlockId === block.id
                      ? "border-[hsl(258,90%,56%)]/60 bg-[hsl(258,90%,56%)]/5"
                      : "border-border/60 hover:border-[hsl(258,90%,56%)]/30"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <FileText className="w-4 h-4 text-[hsl(258,90%,56%)] mt-0.5 flex-shrink-0" />
                    <h3 className="font-semibold text-sm">{i + 1}. {block.title}</h3>
                  </div>
                  <div className="pl-6 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {block.content.split("\n").filter(Boolean).map((line, li) => (
                      <p key={li} className="flex gap-2 mb-1">
                        <span className="text-[hsl(258,90%,56%)] mt-1">•</span>
                        <span>{line.replace(/^[-•]\s*/, "")}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end mt-4">
            <Button
              onClick={onAdvance}
              className="bg-gradient-to-r from-[hsl(258,90%,56%)] to-[hsl(217,91%,50%)] text-white rounded-full px-6"
            >
              Aceitar Escopo & Editar →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right – AI Insight for selected block */}
      <Card className="hidden lg:block">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-[hsl(258,90%,56%)]" />
            Insights da IA
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Selecione um tópico para ver a análise
          </p>
        </CardHeader>
        <CardContent>
          {insight && selectedBlock ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate pr-2">
                  {selectedIndex + 1}. {selectedBlock.title}
                </span>
                {(() => {
                  const style = statusStyles[insight.status];
                  const Icon = style.icon;
                  return (
                    <Badge className={`${style.bg} ${style.text} border-0 text-[10px] px-1.5 py-0 gap-1 shrink-0`}>
                      <Icon className="w-3 h-3" />
                      {style.label}
                    </Badge>
                  );
                })()}
              </div>
              <p className="text-sm font-medium">{insight.summary}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {insight.detail}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
              Nenhum tópico selecionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EscopoIAView;
