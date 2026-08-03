import {
  Building2, Briefcase, AlertTriangle, FileBarChart, History,
  CheckCircle2, Award, FileText, MessageCircle, Clock,
} from "lucide-react";
import ProfileHome from "@/components/shell/ProfileHome";

export default function AdmjudicialDashboard() {
  return (
    <ProfileHome
      defaultName="Administrador"
      subtitle="Painel das recuperandas sob sua administração judicial."
      cards={[
        { label: "Empresas Prospecção", desc: "Empresas sob sua administração.",       icon: Building2,     to: "/admjudicial/recuperandas", tone: "blue"   },
        { label: "Prospecções AJ",         desc: "Relatórios mensais em monitoramento.",  icon: Briefcase,     to: "/admjudicial/rmas",         tone: "purple" },
        { label: "Pendências",   desc: "Documentos aguardando recuperandas.",   icon: AlertTriangle, to: "/admjudicial/pendencias",   tone: "red"    },
        { label: "Relatórios",   desc: "Consolidados e exportações.",           icon: FileBarChart,  to: "/admjudicial/relatorios",   tone: "green"  },
        { label: "Histórico",    desc: "Linha do tempo das ações realizadas.",  icon: History,       to: "/admjudicial/historico",    tone: "teal"   },
        { label: "Comunicação",  desc: "Mensagens com consultores e juízo.",    icon: MessageCircle, to: "/dashboard/comunicacao",    tone: "amber"  },
      ]}
      summary={[
        { label: "Empresas Prospecção",      value: 16,    icon: Building2,     tone: "blue",   to: "/admjudicial/recuperandas" },
        { label: "Prospecções AJ Vigentes",     value: 47,    icon: Briefcase,     tone: "purple", to: "/admjudicial/rmas" },
        { label: "Pendências",        value: 23,    icon: AlertTriangle, tone: "orange", to: "/admjudicial/pendencias" },
        { label: "Críticas",          value: "06",  icon: AlertTriangle, tone: "red"    },
        { label: "Concluídos (30d)",  value: 12,    icon: CheckCircle2,  tone: "green",  to: "/admjudicial/historico" },
        { label: "Score Médio",       value: 74,    icon: Award,         tone: "teal"   },
      ]}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "MOVAG com score crítico (41)", sub: "Requer plano de ação imediato", time: "Hoje" },
        { icon: Clock,         tone: "orange", title: "TECNOMAX com 5 pendências",    sub: "Balancete, DRE e conciliação", time: "10:30" },
        { icon: FileText,      tone: "blue",   title: "Novo Prospecção AJ para revisão",        sub: "DIPLOMATA - Comp. 05/2026", time: "Ontem" },
        { icon: CheckCircle2,  tone: "green",  title: "BENTOIA finalizou ciclo",      sub: "RMA aprovado e publicado", time: "Ontem" },
      ]}
    />
  );
}
