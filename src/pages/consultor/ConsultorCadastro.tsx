import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Scale, Building2, Gavel, Users, ArrowRight, FilePlus } from "lucide-react";
import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import { invokeAuthed } from "@/lib/invokeAuthed";

const opts = [
  {
    label: "Administrador Judicial",
    desc: "Cadastre e gerencie usuários com perfil de Administrador Judicial.",
    icon: Scale,
    tone: { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", ring: "hsl(217,91%,92%)" },
    to: "/consultor/cadastro/admjudicial",
  },
  {
    label: "Empresa Prospecção",
    desc: "Cadastre as empresas que enviam a planilha com informações",
    icon: Building2,
    tone: { bg: "hsl(142,60%,95%)", fg: "hsl(142,60%,35%)", ring: "hsl(142,60%,90%)" },
    to: "/consultor/cadastro/recuperandas",
  },
  {
    label: "Magistrados",
    desc: "Cadastre e gerencie usuários com perfil de Magistrado.",
    icon: Gavel,
    tone: { bg: "hsl(261,80%,96%)", fg: "hsl(261,80%,45%)", ring: "hsl(261,80%,92%)" },
    to: "/consultor/cadastro/magistrados",
  },
  {
    label: "Técnicos",
    desc: "Cadastre e gerencie usuários com perfil de Técnico (Consultor).",
    icon: Users,
    tone: { bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)", ring: "hsl(38,92%,90%)" },
    to: "/consultor/cadastro/tecnicos",
  },
];

export default function ConsultorCadastro() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ aj: 0, emp: 0, mag: 0, tec: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await invokeAuthed<{ profiles: any[] }>("admin-create-user", { action: "list" });
      const profiles = data?.profiles || [];
      const counts = { aj: 0, emp: 0, mag: 0, tec: 0 };
      profiles.forEach((p) => {
        const roles = (p.user_roles || []).map((r: any) => r.role);
        if (roles.includes("admjudicial")) counts.aj++;
        if (roles.includes("recuperanda")) counts.emp++;
        if (roles.includes("magistrado")) counts.mag++;
        if (roles.includes("consultor")) counts.tec++;
      });
      setStats(counts);
    };
    fetchStats();
    
    // Configurar o polling para atualizar os dashboards quando novos registros entrarem
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const dashboards = [
    { label: "Adm. Judiciais", value: stats.aj, icon: Scale, color: "text-[hsl(217,91%,45%)]", bg: "bg-[hsl(217,91%,96%)]" },
    { label: "Empresa Prospecção", value: stats.emp, icon: Building2, color: "text-[hsl(142,60%,35%)]", bg: "bg-[hsl(142,60%,95%)]" },
    { label: "Magistrados", value: stats.mag, icon: Gavel, color: "text-[hsl(261,80%,45%)]", bg: "bg-[hsl(261,80%,96%)]" },
    { label: "Técnicos", value: stats.tec, icon: Users, color: "text-[hsl(38,92%,40%)]", bg: "bg-[hsl(38,92%,95%)]" },
  ];

  return (
    <CadastroPageShell
      breadcrumb={[{ label: "Cadastro de Perfis" }]}
      title="Cadastro de Perfis"
      subtitle="Gerencie usuários e perfis da plataforma."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dashboards.map((d) => (
          <div key={d.label} className="bg-white border border-border rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${d.bg} ${d.color}`}>
              <d.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{d.value}</div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{d.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {opts.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.label}
              onClick={() => navigate(o.to)}
              className="group bg-white border border-border rounded-2xl p-7 text-left hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start gap-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center ring-8"
                  style={{ background: o.tone.bg, color: o.tone.fg, boxShadow: `0 0 0 8px ${o.tone.ring}` }}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold" style={{ color: o.tone.fg }}>{o.label}</div>
                  <p className="text-sm text-muted-foreground mt-1.5">{o.desc}</p>
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center group-hover:translate-x-0.5 transition"
                  style={{ background: o.tone.bg, color: o.tone.fg }}
                >
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mt-5" style={{ color: o.tone.fg }}>
                <FilePlus className="w-3.5 h-3.5" /> Acessar cadastro
              </div>
            </button>
          );
        })}
      </div>
    </CadastroPageShell>
  );
}
