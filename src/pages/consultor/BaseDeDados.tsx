import { useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { Database, Search, Filter, ArrowUpDown } from "lucide-react";

export default function BaseDeDados() {
  const [search, setSearch] = useState("");

  return (
    <ConsultorPageShell
      title="Base de Dados"
      subtitle="Visualização consolidada de informações da base de dados de prospecção."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total Registros", value: 1250, hint: "Base consolidada", icon: Database, tone: "blue" },
        { label: "Novos Hoje", value: 45, hint: "Últimas 24h", icon: Search, tone: "orange" },
        { label: "Processados", value: 1180, hint: "Enriquecidos", icon: Filter, tone: "green" },
        { label: "Taxa Carga", value: "94%", hint: "Sucesso", icon: ArrowUpDown, tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Registros da Base de Dados</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Informações detalhadas sobre os processos e empresas na base.
            </p>
          </div>
        </div>

        <div className="p-10 text-center text-sm text-muted-foreground">
          Aguardando configuração detalhada do MD para exibição dos dados.
        </div>
      </div>
    </ConsultorPageShell>
  );
}
