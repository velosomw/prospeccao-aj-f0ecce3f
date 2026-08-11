import { useState } from "react";
import { AlertTriangle, Filter, Search, Lightbulb, ArrowRight } from "lucide-react";
import { TopicsTaskList, type TopicItem } from "@/components/workspace/TopicsTaskList";
import IATipCard from "@/components/workspace/IATipCard";

interface Props {
  topics: TopicItem[];
  criticas: number;
  onOpenTopic?: (id: string) => void;
  prospecçãoId?: string | null;
}

type Filtro = "todos" | "criticos" | "incompletos" | "pendentes" | "concluidos";

export default function StageRevisaoInteligente({ topics, criticas, onOpenTopic, prospecçãoId }: Props) {

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const counts = {
    todos: topics.length,
    criticos: topics.filter(t => t.severity === "critico").length,
    incompletos: topics.filter(t => t.status === "incompleto").length,
    pendentes: topics.filter(t => t.status === "pendente").length,
    concluidos: topics.filter(t => t.status === "completo").length,
  };

  const filtered = topics.filter(t => {
    if (busca && !t.title.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtro === "criticos") return t.severity === "critico";
    if (filtro === "incompletos") return t.status === "incompleto";
    if (filtro === "pendentes") return t.status === "pendente";
    if (filtro === "concluidos") return t.status === "completo";
    return true;
  });

  const pendingCount = counts.incompletos + counts.pendentes + counts.criticos;

  return (
    <div className="space-y-4">
      {/* Banner principal */}
      {pendingCount > 0 && (
        <div className="bg-[hsl(38,92%,50%)]/10 border border-[hsl(38,92%,50%)]/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[hsl(38,92%,50%)] flex-shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-foreground">Atenção: </span>
            <span className="text-foreground/80">
              {pendingCount} tópicos precisam de revisão para melhorar o score do relatório.
            </span>
          </div>
          <button className="bg-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,45%)] text-white text-xs font-semibold rounded-lg px-3 py-2">
            Resolver críticos primeiro
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-border rounded-lg p-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["todos", "Todos", counts.todos],
            ["criticos", "Críticos", counts.criticos],
            ["incompletos", "Incompletos", counts.incompletos],
            ["pendentes", "Pendentes", counts.pendentes],
            ["concluidos", "Concluídos", counts.concluidos],
          ] as [Filtro, string, number][]
        ).map(([key, label, n]) => {
          const active = filtro === key;
          return (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                active
                  ? "bg-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)] text-white"
                  : "bg-white border-border text-foreground hover:border-[hsl(217,91%,50%)]/40"
              }`}
            >
              {label}
              <span className={`text-[10px] font-bold ${active ? "opacity-90" : "text-muted-foreground"}`}>{n}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-2 py-1.5">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </div>
          <div className="flex items-center gap-1.5 border border-border rounded-lg px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar tópico"
              className="text-xs bg-transparent outline-none w-32 sm:w-48"
            />
          </div>
        </div>
      </div>

      {/* Lista + IA assistiva */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">Tópicos do Prospeccao AJ</h3>
          <TopicsTaskList items={filtered} onOpen={onOpenTopic} prospecçãoId={prospecçãoId} />
        </div>

        <div className="space-y-3">
          <IATipCard
            message={`Resolver os ${counts.criticos} tópicos críticos pode elevar o score em até ${Math.min(18, counts.criticos * 3)} pontos.`}
            ctaLabel="Ver recomendações"
          />
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-[hsl(258,90%,56%)]" />
              <span className="text-xs font-bold uppercase tracking-wide text-foreground">Fluxo de Revisão</span>
            </div>
            <ol className="text-xs space-y-1.5 text-foreground/80 list-decimal list-inside">
              <li>Abrir o tópico</li>
              <li>Visualizar a inconsistência</li>
              <li>Conferir documento de origem</li>
              <li>Validar com IA</li>
              <li>Resolver e recalcular o score</li>
            </ol>
            <button className="mt-3 w-full text-xs font-semibold text-[hsl(217,91%,50%)] flex items-center justify-end gap-1 hover:underline">
              Aprofundar revisão <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
