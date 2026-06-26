import { FileCheck2, Database, ShieldCheck, BadgeCheck } from "lucide-react";

interface Metric { label: string; value: number | null; icon: any; }

interface Props {
  documentos: number;
  dadosExtraidos: number;
  validacoesIA: number;
  conformidade: number | null;
}

function pctColor(v: number | null) {
  if (v == null) return "hsl(220,15%,75%)";
  if (v < 33) return "hsl(0,84%,60%)";
  if (v < 67) return "hsl(38,92%,50%)";
  return "hsl(142,76%,36%)";
}

export default function SaudeRelatorioCard({ documentos, dadosExtraidos, validacoesIA, conformidade }: Props) {
  const items: Metric[] = [
    { label: "Documentos", value: documentos, icon: FileCheck2 },
    { label: "Dados extraídos", value: dadosExtraidos, icon: Database },
    { label: "Validações IA", value: validacoesIA, icon: ShieldCheck },
    { label: "Conformidade", value: conformidade, icon: BadgeCheck },
  ];

  return (
    <div className="bg-white border border-border rounded-lg p-4 flex flex-col">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Saúde do Relatório
      </h3>
      <div className="flex-1 space-y-3 mt-1">
        {items.map((m) => {
          const Icon = m.icon;
          const color = pctColor(m.value);
          const display = m.value == null ? "--%" : `${m.value}%`;
          const w = m.value == null ? 0 : Math.min(100, Math.max(0, m.value));
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  {m.label}
                </div>
                <span className="text-xs font-bold text-foreground">{display}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[hsl(220,15%,92%)] overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${w}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
