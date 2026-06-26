import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, LucideIcon } from "lucide-react";
import PlatformLayout from "@/components/PlatformLayout";
import { useUser } from "@/contexts/UserContext";

/**
 * Tela inicial padronizada para todos os perfis (Gestor IA, Coordenador,
 * Admjudicial, Magistrado, Recuperanda) — mesma identidade visual do
 * ConsultorHome: greeting + cartões circulares + Resumo Geral + Avisos.
 */

export type Tone = "blue" | "green" | "purple" | "amber" | "orange" | "teal" | "red";

const tones: Record<Tone, { ring: string; bg: string; fg: string; arrow: string }> = {
  blue:   { ring: "hsl(217,91%,92%)", bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,50%)", arrow: "hsl(217,91%,50%)" },
  green:  { ring: "hsl(142,60%,90%)", bg: "hsl(142,60%,95%)", fg: "hsl(142,60%,40%)", arrow: "hsl(142,60%,40%)" },
  purple: { ring: "hsl(258,90%,93%)", bg: "hsl(258,90%,96%)", fg: "hsl(258,75%,55%)", arrow: "hsl(258,75%,55%)" },
  amber:  { ring: "hsl(38,95%,90%)",  bg: "hsl(38,95%,95%)",  fg: "hsl(32,90%,50%)",  arrow: "hsl(32,90%,50%)"  },
  orange: { ring: "hsl(18,90%,90%)",  bg: "hsl(18,90%,95%)",  fg: "hsl(18,85%,55%)",  arrow: "hsl(18,85%,55%)"  },
  teal:   { ring: "hsl(186,55%,88%)", bg: "hsl(186,55%,94%)", fg: "hsl(186,55%,40%)", arrow: "hsl(186,55%,40%)" },
  red:    { ring: "hsl(0,84%,92%)",   bg: "hsl(0,84%,96%)",   fg: "hsl(0,84%,55%)",   arrow: "hsl(0,84%,55%)"   },
};

export interface ProfileCard {
  label: string;
  desc: string;
  icon: LucideIcon;
  to: string;
  tone: Tone;
}

export interface ProfileSummary {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: Tone;
  to?: string;
}

export interface ProfileAviso {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  sub: string;
  time: string;
}

interface ProfileHomeProps {
  defaultName: string;
  subtitle?: string;
  cards: ProfileCard[];
  summary: ProfileSummary[];
  avisos: ProfileAviso[];
  /** Conteúdo extra opcional abaixo da área principal. */
  extra?: ReactNode;
}

export default function ProfileHome({
  defaultName,
  subtitle = "Aqui está o resumo geral do sistema.",
  cards,
  summary,
  avisos,
  extra,
}: ProfileHomeProps) {
  const navigate = useNavigate();
  const { userName } = useUser();
  const name = userName?.split(" ")[0] || defaultName;

  return (
    <PlatformLayout>
      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
        {/* Greeting */}
        <header className="mb-7">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            Bem-vindo(a), {name}! <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </header>

        {/* Quick access cards */}
        <section
          className={`grid grid-cols-2 md:grid-cols-3 ${
            ({ 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" } as Record<number, string>)[
              cards.length
            ] || "lg:grid-cols-6"
          } gap-4 mb-8`}
        >
          {cards.map((c) => {
            const t = tones[c.tone];
            const Icon = c.icon;
            return (
              <button
                key={c.label}
                onClick={() => navigate(c.to)}
                className="group bg-white border border-border rounded-2xl p-5 text-center hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col items-center"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-3 ring-8"
                  style={{ background: t.bg, color: t.fg, boxShadow: `0 0 0 8px ${t.ring}` }}
                >
                  <Icon className="w-7 h-7" strokeWidth={2.25} />
                </div>
                <div className="text-base font-bold mt-3" style={{ color: t.fg }}>
                  {c.label}
                </div>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed min-h-[3.5rem]">
                  {c.desc}
                </p>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center mt-3 group-hover:translate-x-0.5 transition"
                  style={{ background: t.bg, color: t.arrow }}
                >
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </section>

        {/* Lower row */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
          {/* Resumo Geral */}
          <section className="bg-white border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-foreground">Resumo Geral</h2>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1.5 hover:bg-muted/40">
                Este mês <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {summary.map((s) => {
                const t = tones[s.tone];
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="border border-border rounded-xl p-4 flex items-center gap-3"
                  >
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">{s.label}</div>
                      <div className="text-2xl font-bold text-foreground leading-tight">
                        {s.value}
                      </div>
                      {s.to && (
                        <button
                          onClick={() => navigate(s.to!)}
                          className="text-[11px] text-[hsl(217,91%,50%)] hover:underline"
                        >
                          Ver detalhes &gt;
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Avisos Recentes */}
          <section className="bg-white border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-foreground">Avisos Recentes</h2>
              <button className="text-xs font-semibold text-[hsl(217,91%,50%)] hover:underline">
                Ver todos
              </button>
            </div>
            <ul className="divide-y divide-border">
              {avisos.map((a, i) => {
                const t = tones[a.tone];
                const Icon = a.icon;
                return (
                  <li key={i} className="flex items-start gap-3 py-3.5">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.sub}</div>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {a.time}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {extra && <div className="mt-8">{extra}</div>}

        <footer className="mt-8 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            © {new Date().getFullYear()} Brasil Expert Administração Judicial e Perícia Contábil.
            Todos os direitos reservados.
          </span>
          <span>Versão 1.0.0</span>
        </footer>
      </div>
    </PlatformLayout>
  );
}
