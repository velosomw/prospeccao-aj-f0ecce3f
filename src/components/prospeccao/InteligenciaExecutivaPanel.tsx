import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";
import { type ProspeccaoLinha } from "@/services/prospeccaoService";

interface InteligenciaExecutivaPanelProps {
  linha: ProspeccaoLinha;
}

export function InteligenciaExecutivaPanel({ linha }: InteligenciaExecutivaPanelProps) {
  const ws = linha.ai_extracted?.workspace || {};

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-semibold">IA</span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">Análise Inteligente - {ws.processo || "Processo não identificado"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 text-sm">
          {/* Cabeçalho */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
            <div><p className="text-xs text-muted-foreground">Empresa Prospectada</p><p className="font-semibold">{ws.empresa || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Classe Processual</p><p className="font-semibold">{ws.tipo_processo || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Vara/Comarca/Estado</p><p className="font-semibold">{ws.vara || "—"} / {ws.comarca || "—"} / {ws.estado || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Confiabilidade</p><p className="font-semibold text-blue-600">{ws.score_confianca || 0}%</p></div>
          </div>

          {/* Resumo Executivo */}
          <section>
            <h3 className="font-semibold mb-2">Resumo Executivo</h3>
            <p className="text-muted-foreground leading-relaxed">{ws.resumo_executivo || "Análise em processamento ou não disponível."}</p>
          </section>

          {/* Por que interessa? */}
          <section className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="font-semibold text-blue-900 mb-2">Por que este processo interessa à BEx?</h3>
            <p className="text-blue-800 text-sm">{ws.interesse_bex || "Informação não disponível."}</p>
          </section>

          {/* Recomendação */}
          <section className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
            <h3 className="font-semibold text-emerald-900 mb-2">Recomendação IA</h3>
            <p className="text-emerald-800 text-sm">{ws.recomendacao_ia || "Acompanhar conforme fluxo padrão."}</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
