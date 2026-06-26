import { ReactNode } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import { Search } from "lucide-react";

interface KPI { label: string; value: string | number; hint?: string; icon: any; tone?: "blue" | "purple" | "green" | "orange" | "red" | "slate"; }

const tones: Record<string, { bg: string; fg: string }> = {
  blue:   { bg: "hsl(217,91%,96%)",  fg: "hsl(217,91%,45%)"  },
  purple: { bg: "hsl(258,90%,96%)",  fg: "hsl(258,90%,45%)"  },
  green:  { bg: "hsl(142,76%,93%)",  fg: "hsl(142,76%,30%)"  },
  orange: { bg: "hsl(38,92%,95%)",   fg: "hsl(38,92%,40%)"   },
  red:    { bg: "hsl(0,84%,95%)",    fg: "hsl(0,84%,45%)"    },
  slate:  { bg: "hsl(220,15%,93%)",  fg: "hsl(220,15%,40%)"  },
};

export default function ConsultorPageShell({
  title, subtitle, search, onSearch, kpis, children,
}: {
  title: string; subtitle: string; search?: string; onSearch?: (v: string) => void;
  kpis: KPI[]; children: ReactNode;
}) {
  return (
    <PlatformLayout>
      <div className="px-6 lg:px-8 py-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {onSearch && (
            <div className="relative w-full lg:w-[420px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search || ""}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-9 pr-3 h-10 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {kpis.map((k) => {
            const Icon = k.icon;
            const t = tones[k.tone || "blue"];
            return (
              <div key={k.label} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="text-xs text-muted-foreground font-medium">{k.label}</div>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: t.bg }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: t.fg }} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground mt-2">{k.value}</div>
                {k.hint && <div className="text-[11px] text-muted-foreground mt-1">{k.hint}</div>}
              </div>
            );
          })}
        </div>

        {children}
      </div>
    </PlatformLayout>
  );
}
