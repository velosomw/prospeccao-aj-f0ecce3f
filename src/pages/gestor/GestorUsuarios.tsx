import { Users, Shield, UserCheck, UserX, Plus } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const users = [
  { nome: "Maria Lima",      email: "maria@bex.com",     role: "Coordenador", status: "Ativo",     last: "Hoje 14:02" },
  { nome: "Ana Silva",       email: "ana@bex.com",       role: "Consultor",   status: "Ativo",     last: "Hoje 13:18" },
  { nome: "Carlos Mendes",   email: "carlos@bex.com",    role: "Consultor",   status: "Ativo",     last: "Hoje 11:40" },
  { nome: "Dr. José Souza",  email: "jose@trib.gov.br",  role: "Magistrado",  status: "Ativo",     last: "Ontem" },
  { nome: "Empresa XPTO",email: "rec@xpto.com",      role: "Empresa Prospecção", status: "Inativo",   last: "Há 5d" },
  { nome: "Adm. Judicial Y", email: "adm@y.com",         role: "Adm Judicial",status: "Ativo",     last: "Hoje 09:32" },
];

const roleColor: Record<string, { bg: string; fg: string }> = {
  "Coordenador":  { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)" },
  "Consultor":    { bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,45%)" },
  "Magistrado":   { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Empresa Prospecção":  { bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" },
  "Adm Judicial": { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
};

export default function GestorUsuarios() {
  return (
    <ConsultorPageShell
      title="Usuários" subtitle="Gestão hierárquica de acessos e perfis da plataforma."
      kpis={[
        { label: "Total",        value: users.length, hint: "Cadastrados",  icon: Users,      tone: "blue" },
        { label: "Ativos",       value: users.filter(u => u.status === "Ativo").length, hint: "Online recente", icon: UserCheck, tone: "green" },
        { label: "Inativos",     value: users.filter(u => u.status === "Inativo").length, hint: "30d sem acesso", icon: UserX,    tone: "red" },
        { label: "Coordenadores",value: 1, hint: "Gestão",                  icon: Shield,     tone: "blue" },
        { label: "Consultores",  value: 2, hint: "Operação",                icon: Users,      tone: "purple" },
        { label: "Externos",     value: 3, hint: "Magistrado/AJ/RJ",        icon: Users,      tone: "orange" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Membros</h3>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary px-3 py-1.5 rounded-md hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Criar usuário
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Usuário</th>
              <th className="text-left px-4 py-2.5">Perfil</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const r = roleColor[u.role];
              return (
                <tr key={u.email} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {u.nome.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                    <div>
                      <div className="font-medium">{u.nome}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: r.bg, color: r.fg }}>{u.role}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${u.status === "Ativo" ? "text-green-600" : "text-red-600"}`}>● {u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{u.last}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
