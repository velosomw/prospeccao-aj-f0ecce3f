import { MessageCircle, User } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import MessagingPanel from "@/components/messaging/MessagingPanel";

export default function RecComunicacao() {
  return (
    <ConsultorPageShell
      title="Comunicação"
      subtitle="Mensagens em tempo real com o consultor, coordenador e administração judicial."
      kpis={[
        { label: "Conversas",      value: 0, icon: MessageCircle, tone: "blue" },
        { label: "Não lidas",      value: 0, icon: MessageCircle, tone: "red" },
        { label: "Consultor",      value: 0, icon: User,          tone: "purple" },
        { label: "Coordenador",    value: 0, icon: User,          tone: "green" },
        { label: "Adm. Judicial",  value: 0, icon: User,          tone: "orange" },
        { label: "Tempo Resposta", value: "-", icon: MessageCircle, tone: "slate" },
      ]}
    >
      <MessagingPanel />
    </ConsultorPageShell>
  );
}
