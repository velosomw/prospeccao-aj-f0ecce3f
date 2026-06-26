import ConsultorPageShell from "@/components/consultor/PageShell";
import { Bell, AlertCircle, CheckCircle2, Clock, Mail, FileText } from "lucide-react";

export default function ConsultorAvisos() {
  return (
    <ConsultorPageShell
      title="Avisos"
      subtitle="Notificações, prazos e comunicados importantes."
      kpis={[
        { label: "Não lidos",  value: 3,  icon: Bell,         tone: "red"    },
        { label: "Prazos",     value: 2,  icon: Clock,        tone: "orange" },
        { label: "Sistema",    value: 5,  icon: AlertCircle,  tone: "purple" },
        { label: "Concluídos", value: 12, icon: CheckCircle2, tone: "green"  },
        { label: "E-mails",    value: 8,  icon: Mail,         tone: "blue"   },
        { label: "Documentos", value: 4,  icon: FileText,     tone: "slate"  },
      ]}
    >
      <div className="bg-white rounded-xl border p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
          <Bell className="w-7 h-7" style={{ color: "hsl(18,85%,55%)" }} />
        </div>
        <h3 className="text-base font-semibold mb-1">Módulo em construção</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A central de avisos e notificações será disponibilizada em breve.
        </p>
      </div>
    </ConsultorPageShell>
  );
}
