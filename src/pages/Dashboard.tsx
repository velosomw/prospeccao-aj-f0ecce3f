import {
  FilePlus, FileBarChart, Activity, MessageCircle, Megaphone, Building2,
  Briefcase, AlertTriangle, CheckCircle2, Inbox, Bell, Users,
  Clock, FileText,
} from "lucide-react";
import ProfileHome from "@/components/shell/ProfileHome";

export default function Dashboard() {
  return (
    <ProfileHome
      defaultName="Coordenador"
      subtitle="Visão consolidada da operação, equipe e clientes."
      cards={[
        { label: "Cadastros",   desc: "Novos clientes, processos e Prospecçãos.",          icon: FilePlus,     to: "/cadastro-prospecção",          tone: "blue"   },
        { label: "Relatórios",  desc: "Gere, revise e exporte relatórios.",         icon: FileBarChart, to: "/dashboard/relatorios",  tone: "green"  },
        { label: "Dashboard",   desc: "Indicadores analíticos da operação.",        icon: Activity,     to: "/dashboard/analitico",   tone: "purple" },
        { label: "Avisos",      desc: "Prazos críticos e alertas da equipe.",       icon: Megaphone,    to: "/dashboard/avisos",      tone: "orange" },
        { label: "Clientes",    desc: "Carteira e empresas sob acompanhamento.",    icon: Building2,    to: "/dashboard/empresas",    tone: "teal"   },
      ]}
      summary={[]}
      avisos={[]}
    />
  );
}
