import { ReactNode } from "react";
import { Link } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { ChevronRight } from "lucide-react";

export default function CadastroPageShell({
  breadcrumb, title, subtitle, children,
}: {
  breadcrumb: { label: string; to?: string }[];
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <PlatformLayout>
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground">{b.label}</Link>
              ) : (
                <span className="text-foreground font-medium">{b.label}</span>
              )}
            </span>
          ))}
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </header>

        {children}
      </div>
    </PlatformLayout>
  );
}
