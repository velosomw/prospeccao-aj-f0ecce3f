import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { Building2, Briefcase, CheckCircle2, AlertTriangle, Eye, MapPin, Calendar } from "lucide-react";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function ConsultorClientes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const { data, isLoading } = useCompaniesPage({ mode: "assigned", page: 1, pageSize: 200, search });
  const allCompanies = (data?.rows || []) as any[];

  // "RMA em execução" = empresa ativa + possui rma_id vinculado
  const companies = useMemo(() => {
    return allCompanies.filter((c) => {
      const hasRma = !!c.rma_id;
      const active = (c.status || "").toLowerCase() !== "inativo";
      return onlyActive ? hasRma && active : true;
    });
  }, [allCompanies, onlyActive]);

  const totalAtivas = allCompanies.filter((c) => !!c.rma_id && (c.status || "").toLowerCase() !== "inativo").length;
  const totalInativas = allCompanies.length - totalAtivas;

  return (
    <ConsultorPageShell
      title="Clientes"
      subtitle="Empresas cadastradas com RMA em execução sob sua consultoria."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total Clientes", value: allCompanies.length, icon: Building2, tone: "blue" },
        { label: "Com RMA Ativo", value: totalAtivas, icon: CheckCircle2, tone: "green" },
        { label: "Sem RMA / Inativas", value: totalInativas, icon: AlertTriangle, tone: "orange" },
        { label: "Em Análise", value: totalAtivas, icon: Briefcase, tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            {onlyActive ? "Clientes com RMA em execução" : "Todos os clientes"}
          </h3>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Apenas com RMA em execução
          </label>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : companies.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma empresa encontrada{onlyActive ? " com RMA em execução." : "."}
          </div>
        ) : (
          <div className="divide-y">
            {companies.map((c) => {
              const periodo =
                c.current_period_month && c.execution_year
                  ? `${MESES[(c.current_period_month - 1) % 12]}/${c.execution_year}`
                  : null;
              return (
                <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-muted/20">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{c.name || "—"}</span>
                      {c.rma_id && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-primary border border-blue-100">
                          {c.rma_id}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          (c.status || "").toLowerCase() === "ativa"
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {c.status || "—"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{c.cnpj || "Sem CNPJ"}</span>
                      {(c.city || c.uf) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {c.city || "—"}/{c.uf || "—"}
                        </span>
                      )}
                      {periodo && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Período: {periodo}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/consultor/rmas?company=${c.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver RMAs
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ConsultorPageShell>
  );
}
