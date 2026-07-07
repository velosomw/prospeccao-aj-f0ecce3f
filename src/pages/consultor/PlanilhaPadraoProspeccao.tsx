import { useMemo, useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { FileSpreadsheet, Building2, Scale, MapPin } from "lucide-react";

type Linha = {
  data_distribuicao: string | null;
  mes: string | null;
  numero_processo: string | null;
  empresa: string | null;
  vara_comarca: string | null;
  estado: string | null;
  valor_passivo: number | null;
  aj_nomeado: string | null;
  juiz: string | null;
};

// Dados extraídos da planilha padrão "BEx_Planilha_Padrão_Prospecção_Administrador_Judicial"
const LINHAS: Linha[] = [
  {
    data_distribuicao: "2026-02-27",
    mes: null,
    numero_processo: "4000060-42.2026.8.26.0373",
    empresa: "Rp Liquido - Comercio, Logistica, Servicos E Transportes Ltda",
    vara_comarca:
      "Vara Reg. Comp. Empresarial E Conflitos A Arbitragem Foro Espec. 3ª e 6ª Rajs",
    estado: "SP",
    valor_passivo: 10404818.49,
    aj_nomeado: null,
    juiz: "Carina Roselino Biagi",
  },
];

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function fmtDate(s: string | null) {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function mesFrom(s: string | null, fallback: string | null) {
  if (fallback) return fallback;
  if (!s) return "—";
  const m = s.match(/^\d{4}-(\d{2})/);
  return m ? MESES_PT[parseInt(m[1], 10) - 1] : "—";
}
function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PlanilhaPadraoProspeccao() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LINHAS;
    return LINHAS.filter((l) =>
      [l.numero_processo, l.empresa, l.vara_comarca, l.estado, l.juiz, l.aj_nomeado]
        .some((v) => v && v.toLowerCase().includes(q)),
    );
  }, [search]);

  const totalPassivo = filtered.reduce((s, l) => s + (l.valor_passivo || 0), 0);
  const ufs = new Set(filtered.map((l) => l.estado).filter(Boolean)).size;
  const empresas = new Set(filtered.map((l) => l.empresa).filter(Boolean)).size;

  return (
    <ConsultorPageShell
      title="Planilha Padrão Prospecção"
      subtitle="Dados da planilha padrão de prospecção para Administrador Judicial — recuperações judiciais mapeadas."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total de Linhas", value: filtered.length, hint: "Processos listados", icon: FileSpreadsheet, tone: "blue" },
        { label: "Empresas",        value: empresas,        hint: "Distintas",           icon: Building2,      tone: "purple" },
        { label: "UFs",             value: ufs,             hint: "Estados",             icon: MapPin,         tone: "orange" },
        { label: "Passivo Total",   value: fmtMoney(totalPassivo), hint: "Somatório",     icon: Scale,          tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Recuperações Judiciais</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estrutura idêntica à planilha padrão enviada — colunas: Data da Distribuição, Mês, Nº Processo,
            Empresa, Vara e Comarca, Estado, Valor do Passivo, AJ Nomeado e Juiz / Juíza.
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma linha encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[hsl(217,91%,50%)] text-white">
                <tr>
                  {[
                    "Data da Distribuição","Mês","Nº Processo","Empresa",
                    "Vara e Comarca","Estado","Valor do Passivo","AJ Nomeado","Juiz / Juíza",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                    <td className="px-3 py-2 border-b whitespace-nowrap">{fmtDate(r.data_distribuicao)}</td>
                    <td className="px-3 py-2 border-b whitespace-nowrap">{mesFrom(r.data_distribuicao, r.mes)}</td>
                    <td className="px-3 py-2 border-b font-mono whitespace-nowrap">{r.numero_processo || "—"}</td>
                    <td className="px-3 py-2 border-b max-w-[280px]"><span className="block truncate" title={r.empresa || undefined}>{r.empresa || "—"}</span></td>
                    <td className="px-3 py-2 border-b max-w-[300px]"><span className="block truncate" title={r.vara_comarca || undefined}>{r.vara_comarca || "—"}</span></td>
                    <td className="px-3 py-2 border-b">{r.estado || "—"}</td>
                    <td className="px-3 py-2 border-b whitespace-nowrap">{fmtMoney(r.valor_passivo)}</td>
                    <td className="px-3 py-2 border-b">{r.aj_nomeado || "—"}</td>
                    <td className="px-3 py-2 border-b">{r.juiz || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ConsultorPageShell>
  );
}
