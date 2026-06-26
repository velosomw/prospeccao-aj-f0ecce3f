import ConsultorPageShell from "@/components/consultor/PageShell";
import MessagingPanel from "@/components/messaging/MessagingPanel";
import { MessageCircle, Inbox, Send, Bell, Users, Clock } from "lucide-react";

export default function ConsultorComunicacao() {
  return (
    <ConsultorPageShell
      title="Comunicação"
      subtitle="Mensagens em tempo real com recuperandas, coordenadores e magistrado."
      kpis={[
        { label: "Conversas",   value: 0, icon: MessageCircle, tone: "blue"   },
        { label: "Não lidas",   value: 0, icon: Inbox,         tone: "red"    },
        { label: "Enviadas",    value: 0, icon: Send,          tone: "green"  },
        { label: "Participantes", value: 0, icon: Users,       tone: "purple" },
        { label: "Alertas",     value: 0, icon: Bell,          tone: "orange" },
        { label: "Pendentes",   value: 0, icon: Clock,         tone: "slate"  },
      ]}
    >
      <MessagingPanel />
    </ConsultorPageShell>
  );
}
