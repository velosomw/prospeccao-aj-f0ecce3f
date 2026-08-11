// Renderiza dados de planilhas (arrays de arrays — primeira linha = cabeçalho).
import { useMemo } from "react";

interface Props {
  data: unknown[][];
  title?: string;
  caption?: string;
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    // datas em foprospecçãoto 2026-01-25 00:00:00 chegam como string; números são valores
    return Number.isInteger(v) ? v.toString() : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return v;
  }
  return String(v);
}

export default function PlanilhaTable({ data, title, caption }: Props) {
  const { headers, rows } = useMemo(() => {
    if (!data || data.length === 0) return { headers: [] as unknown[], rows: [] as unknown[][] };
    return { headers: data[0] || [], rows: data.slice(1) };
  }, [data]);

  if (!headers.length) {
    return <div className="p-6 text-sm text-muted-foreground text-center">Planilha vazia.</div>;
  }

  return (
    <div className="w-full">
      {title && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <div className="text-sm font-semibold">{title}</div>
          {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[hsl(217,91%,50%)] text-white sticky top-0">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">
                  {String(h ?? "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                {headers.map((_, ci) => {
                  const cell = row[ci];
                  const isUrl = typeof cell === "string" && /^https?:\/\//.test(cell);
                  return (
                    <td key={ci} className="px-3 py-2 align-top border-b border-r border-border/40 last:border-r-0 max-w-[280px]">
                      {isUrl ? (
                        <a href={cell} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                          {cell}
                        </a>
                      ) : (
                        <span className="break-words">{fmt(cell)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="p-6 text-sm text-muted-foreground text-center">Sem registros.</div>
      )}
    </div>
  );
}
