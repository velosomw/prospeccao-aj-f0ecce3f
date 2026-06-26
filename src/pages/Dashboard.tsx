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
        { label: "Cadastros",   desc: "Novos clientes, processos e RMAs.",          icon: FilePlus,     to: "/cadastro-rma",          tone: "blue"   },
        { label: "Relatórios",  desc: "Gere, revise e exporte relatórios.",         icon: FileBarChart, to: "/dashboard/relatorios",  tone: "green"  },
        { label: "Dashboard",   desc: "Indicadores analíticos da operação.",        icon: Activity,     to: "/dashboard/analitico",   tone: "purple" },
        { label: "Comunicação", desc: "Mensagens, comentários e revisões.",         icon: MessageCircle,to: "/dashboard/comunicacao", tone: "amber"  },
        { label: "Avisos",      desc: "Prazos críticos e alertas da equipe.",       icon: Megaphone,    to: "/dashboard/avisos",      tone: "orange" },
        { label: "Clientes",    desc: "Carteira e empresas sob acompanhamento.",    icon: Building2,    to: "/dashboard/empresas",    tone: "teal"   },
      ]}
      summary={[
        { label: "RMAs em andamento",    value: 24,  icon: Briefcase,     tone: "blue",   to: "/consultor/rmas" },
        { label: "Pendências críticas",  value: 7,   icon: AlertTriangle, tone: "red",    to: "/dashboard/aprovacoes" },
        { label: "RMAs finalizados",     value: 38,  icon: CheckCircle2,  tone: "green",  to: "/dashboard/historico" },
        { label: "Documentos recebidos", value: 312, icon: Inbox,         tone: "purple" },
        { label: "Clientes ativos",      value: 19,  icon: Building2,     tone: "teal",   to: "/dashboard/empresas" },
        { label: "Avisos não lidos",     value: "05",icon: Bell,          tone: "orange", to: "/dashboard/avisos" },
      ]}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "Prazo RMA-0014 vence hoje",       sub: "TECNOMAX - Consultor: Ana Silva", time: "há 12 min" },
        { icon: Clock,         tone: "orange", title: "Aguardando assinatura do AJ",     sub: "DIPLOMATA - Competência 05/2026", time: "há 1h" },
        { icon: MessageCircle, tone: "blue",   title: "Novo comentário do magistrado",   sub: "BENTOIA - Processo 5001234-66",   time: "há 2h" },
        { icon: CheckCircle2,  tone: "green",  title: "RMA-0009 concluído",              sub: "BENTOIA - Aprovado por Coord.",    time: "há 4h" },
      ]}
    />
  );
}
