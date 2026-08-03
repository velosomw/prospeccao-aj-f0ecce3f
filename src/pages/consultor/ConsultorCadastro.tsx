import { useNavigate } from "react-router-dom";
import { Scale, Building2, Gavel, ArrowRight, FilePlus } from "lucide-react";
import CadastroPageShell from "@/components/consultor/CadastroPageShell";

const opts = [
  {
    label: "Administrador Judicial",
    desc: "Cadastre e gerencie usuários com perfil de Administrador Judicial.",
    icon: Scale,
    tone: { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", ring: "hsl(217,91%,92%)" },
    to: "/consultor/cadastro/admjudicial",
  },
  {
    label: "Empresa Externa",
    desc: "Cadastre as empresas que enviam a planilha com informações",
    icon: Building2,
    tone: { bg: "hsl(142,60%,95%)", fg: "hsl(142,60%,35%)", ring: "hsl(142,60%,90%)" },
    to: "/consultor/cadastro/recuperandas",
  },
  {
    label: "Magistrados",
    desc: "Cadastre e gerencie usuários com perfil de Magistrado.",
    icon: Gavel,
    tone: { bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)", ring: "hsl(38,92%,90%)" },
    to: "/consultor/cadastro/magistrados",
  },
];

export default function ConsultorCadastro() {
  const navigate = useNavigate();
  return (
    <CadastroPageShell
      breadcrumb={[{ label: "Cadastro de Perfils" }]}
      title="Cadastro de Perfils"
      subtitle="Selecione abaixo o tipo de cadastro que deseja gerenciar."
    >
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
