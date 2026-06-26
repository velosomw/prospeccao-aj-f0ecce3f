import ConsultorPageShell from "@/components/consultor/PageShell";
import { Settings, Bell, Shield, User, Palette, KeyRound } from "lucide-react";

export default function ConsultorConfiguracoes() {
  return (
    <ConsultorPageShell
      title="Configurações"
      subtitle="Preferências da conta, notificações e segurança."
      kpis={[
        { label: "Perfil",         value: "—", icon: User,     tone: "blue"   },
        { label: "Notificações",   value: "—", icon: Bell,     tone: "orange" },
        { label: "Segurança",      value: "—", icon: Shield,   tone: "red"    },
        { label: "Senha",          value: "—", icon: KeyRound, tone: "purple" },
        { label: "Aparência",      value: "—", icon: Palette,  tone: "green"  },
        { label: "Integrações",    value: "—", icon: Settings, tone: "slate"  },
      ]}
    >
      <div className="bg-white rounded-xl border p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Settings className="w-7 h-7 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold mb-1">Módulo em construção</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          As configurações do usuário e da conta serão disponibilizadas em breve.
        </p>
      </div>
    </ConsultorPageShell>
  );
}
