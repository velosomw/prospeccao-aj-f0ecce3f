import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles, Building2, Gavel, MapPin, Calendar, User, TrendingUp, AlertCircle, FileText, ChevronRight } from "lucide-react";
import { type ProspeccaoLinha } from "@/services/prospeccaoService";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InteligenciaExecutivaPanelProps {
  linha: ProspeccaoLinha;
}

export function InteligenciaExecutivaPanel({ linha }: InteligenciaExecutivaPanelProps) {
  const ws = linha.ai_extracted?.workspace || {};
  const score = ws.score_comercial || {};
  const resComercial = ws.resumo_comercial || {};

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-semibold">IA</span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto bg-slate-50">
        <SheetHeader className="mb-6 p-4 bg-white border-b sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <SheetTitle className="text-xl font-bold text-blue-900">
                {ws.processo || "Processo não identificado"}
              </SheetTitle>
              <p className="text-sm text-muted-foreground font-medium mt-1">
                {ws.empresa || "Empresa não identificada"}
              </p>
            </div>
            {ws.score_confianca && (
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Confiabilidade IA</div>
                <div className="text-2xl font-black text-blue-600">{ws.score_confianca}%</div>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-12">
          {/* Cabeçalho Técnico */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-white rounded-xl border shadow-sm">
            <InfoItem label="Classe Processual" value={ws.tipo_processo} />
            <InfoItem label="Vara" value={ws.vara} />
            <InfoItem label="Estado" value={ws.estado} />
            <InfoItem label="Status" value={ws.fase} />
            <InfoItem label="Data Distribuição" value={linha.data_distribuicao} />
            <InfoItem label="AJ Nomeado" value={ws.administrador_judicial} />
          </div>

          {/* Resumo Executivo */}
          <section className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="text-base font-bold text-slate-800 mb-3 border-b pb-2">Resumo Executivo</h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              {ws.resumo_executivo || "Aguardando processamento inteligente..."}
            </p>
          </section>

          {/* Cards de Inteligência */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm">
              <h3 className="font-bold text-blue-900 mb-2">Por que este processo interessa?</h3>
              <p className="text-blue-800 text-xs leading-relaxed">
                {ws.interesse_bex || "Informação não disponível."}
              </p>
            </section>

            <section className="bg-emerald-50 p-5 rounded-xl border border-emerald-100 shadow-sm">
              <h3 className="font-bold text-emerald-900 mb-2">Recomendação IA</h3>
              <p className="text-emerald-800 text-xs leading-relaxed">
                {ws.recomendacao_ia || "Monitoramento padrão."}
              </p>
            </section>
          </div>

          {/* Score Comercial */}
          <section className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="text-base font-bold text-slate-800 mb-4 border-b pb-2">Score Comercial BEx</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <ScoreMetric label="Potencial Econômico" value={score.potencial} />
              <ScoreMetric label="Maturidade" value={score.probabilidade_aj} />
              <ScoreMetric label="Prioridade" value={score.prioridade} />
            </div>
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase">Vale a pena acompanhar?</span>
                <div className={`text-lg font-black ${resComercial.status === 'SIM' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {resComercial.status || 'ANÁLISE PENDENTE'}
                </div>
              </div>
              <div className="text-right max-w-[60%]">
                <p className="text-xs text-slate-500 italic">{resComercial.justificativa}</p>
              </div>
            </div>
          </section>

          {/* Alertas */}
          {ws.alertas && ws.alertas.length > 0 && (
            <section className="bg-white p-5 rounded-xl border shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-3">Alertas Inteligentes</h3>
              <div className="space-y-2">
                {ws.alertas.map((a: any, idx: number) => (
                  <div key={idx} className={`p-3 rounded-lg border flex gap-3 ${
                    a.gravidade === 'alta' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-amber-50 border-amber-100 text-amber-800'
                  }`}>
                    <div className="font-bold text-xs uppercase">{a.tipo}</div>
                    <div className="text-xs">{a.mensagem}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Evidências */}
          <section className="bg-white p-5 rounded-xl border shadow-sm">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Evidências
            </h3>
            <div className="space-y-2">
              {ws.evidencias?.map((e: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg text-xs border border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-colors">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-slate-700 uppercase">{e.campo}</span>
                    <span className="text-slate-500 italic">" {e.trecho} "</span>
                  </div>
                  {linha.link_documento && (
                    <a 
                      href={`${linha.link_documento}#page=${e.pagina}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-right flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold"
                    >
                      <span className="px-2 py-1 bg-white border rounded">Pág. {e.pagina}</span>
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Por que este processo interessa à BEx? */}
          <section className="bg-slate-800 text-white p-6 rounded-xl border shadow-xl">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Por que este processo interessa à BEx?
            </h3>
            <div className="space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed italic border-l-2 border-blue-500 pl-4">
                {ws.interesse_bex || "O motor IA está analisando a aderência deste caso ao perfil comercial da BEx..."}
              </p>
              
              {ws.proximos_eventos && ws.proximos_eventos.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-3 tracking-widest">Próximos Eventos Esperados</h4>
                  <div className="flex flex-col gap-3">
                    {ws.proximos_eventos.map((evt: string, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-600">
                          {i + 1}
                        </div>
                        <span className="text-xs text-slate-300">{evt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Confiabilidade da Análise */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-4 border-t px-2">
            <div>Motor: {linha.ai_extracted?.motor || "Gemini 1.5 Flash"}</div>
            <div>Versão da Análise: {ws.versao || "2.0"}</div>
            <div>Último Processamento: {new Date().toLocaleDateString("pt-BR")}</div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoItem({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5 tracking-tight">{label}</p>
      <p className="font-semibold text-slate-800 truncate" title={value}>{value || "—"}</p>
    </div>
  );
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  const colorClass = value > 70 ? 'bg-emerald-500' : value > 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] uppercase font-bold text-slate-500">{label}</span>
        <span className="text-xs font-black text-slate-700">{value || 0}</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${value || 0}%` }} />
      </div>
    </div>
  );
}
