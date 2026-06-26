import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import { Plus, Search, Building2, Edit2, Trash2 } from "lucide-react";

const mockRec = [
  { id: 1, razao: "DIPLOMATA Indústria S.A.", cnpj: "11.111.111/0001-11", responsavel: "—", telefone: "(11) 3000-0000", email: "contato@diplomata.com.br" },
];

export default function ConsultorCadastroRec() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const rows = mockRec.filter(r => !search || r.razao.toLowerCase().includes(search.toLowerCase()) || r.cnpj.includes(search));

  return (
    <CadastroPageShell
      breadcrumb={[{ label: "Cadastros", to: "/consultor/cadastro" }, { label: "Recuperandas" }]}
      title="Recuperandas"
      subtitle="Lista de empresas em recuperação judicial cadastradas."
    >
      <div className="bg-white border border-border rounded-2xl">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por razão social ou CNPJ..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30"
            />
          </div>
          <button
            onClick={() => navigate("/consultor/cadastro/recuperandas/nova")}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[hsl(217,91%,40%)] hover:bg-[hsl(217,91%,35%)] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova Recuperanda
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-7 h-7" style={{ color: "hsl(142,60%,35%)" }} />
            </div>
            <h3 className="text-sm font-semibold">Nenhuma recuperanda cadastrada</h3>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Recuperanda" para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(220,20%,97%)] text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Razão Social</th>
                  <th className="text-left px-4 py-3 font-semibold">CNPJ</th>
                  <th className="text-left px-4 py-3 font-semibold">Responsável</th>
                  <th className="text-left px-4 py-3 font-semibold">Contato</th>
                  <th className="text-right px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.razao}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.cnpj}</td>
                    <td className="px-4 py-3">{r.responsavel}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}<br /><span className="text-xs">{r.telefone}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="w-8 h-8 rounded-md border border-border hover:bg-muted/40 flex items-center justify-center text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button className="w-8 h-8 rounded-md border border-border hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CadastroPageShell>
  );
}
