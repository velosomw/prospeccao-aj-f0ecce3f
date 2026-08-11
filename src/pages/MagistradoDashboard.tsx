import {
  Gavel, FileText, Building2, Scale, History, MessageCircle,
  AlertTriangle, CheckCircle2, Clock, Bell,
} from "lucide-react";
import ProfileHome from "@/components/shell/ProfileHome";

export default function MagistradoDashboard() {
  return (
    <ProfileHome
      defaultName="Magistrado"
      subtitle="Panorama dos processos de recuperação judicial sob sua jurisdição."
      cards={[
        { label: "Processos",      desc: "Processos sob sua jurisdição.",         icon: Gavel,         to: "/magistrado/processos", tone: "blue"   },
        { label: "Prospecções AJ Recebidos", desc: "Prospecçãos aguardando sua análise.",          icon: FileText,      to: "/magistrado/prospecçãos",      tone: "purple" },
        { label: "Empresas Prospecção",   desc: "Empresas em recuperação.",              icon: Building2,     to: "/magistrado/empresas",  tone: "teal"   },
        { label: "Decisões",       desc: "Deliberações e despachos.",             icon: Scale,         to: "/magistrado/decisoes",  tone: "amber"  },
        { label: "Histórico",      desc: "Linha do tempo e arquivo.",             icon: History,       to: "/magistrado/historico", tone: "green"  },
      ]}
      summary={[
        { label: "Processos Ativos",   value: 33,    icon: Gavel,         tone: "blue"   },
        { label: "Empresas Prospecção",       value: 18,    icon: Building2,     tone: "purple" },
        { label: "Prospecções AJ a Analisar",    value: "07",  icon: FileText,      tone: "orange", to: "/magistrado/prospecçãos" },
        { label: "Decisões Pendentes", value: "04",  icon: AlertTriangle, tone: "red",    to: "/magistrado/decisoes" },
        { label: "Encerrados (30d)",   value: 9,     icon: CheckCircle2,  tone: "green"  },
        { label: "Tempo Médio",        value: "14d", icon: Clock,         tone: "teal"   },
      ]}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "Prospecção AJ crítico aguardando despacho", sub: "MOVAG - há 3 dias", time: "Hoje" },
        { icon: FileText,      tone: "blue",   title: "Novo Prospecção AJ recebido",               sub: "DIPLOMATA - Comp. 05/2026", time: "10:20" },
        { icon: Scale,         tone: "amber",  title: "Audiência agendada",              sub: "Processo 5001234-66 - 22/06", time: "Ontem" },
        { icon: CheckCircle2,  tone: "green",  title: "Decisão proferida e publicada",   sub: "BENTOIA - homologação", time: "Ontem" },
      ]}
    />
  );
}
