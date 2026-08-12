import {
  Building2, Briefcase, AlertTriangle, FileBarChart, History,
  CheckCircle2, Award, FileText, Clock,
} from "lucide-react";
import ProfileHome, { ProfileSummary } from "@/components/shell/ProfileHome";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";
import { useMemo } from "react";

export default function AdmjudicialDashboard() {
  const { data: statsData } = useCompaniesStats("released");

  const summary = useMemo<ProfileSummary[]>(() => {
    const bs = statsData?.byStatus ?? {};
    const total = statsData?.total ?? 0;
    const vigentes = (bs["ativa"] || 0) + (bs["em_analise"] || 0);
    const pendencias = bs["pendente_ativacao"] || 0;
    const concluidos = bs["concluido"] || 0;

    return [
      { label: "Empresas Prospecção",      value: total,    icon: Building2,     tone: "blue",   to: "/admjudicial/recuperandas" },
      { label: "Prospecções AJ Vigentes",     value: vigentes,    icon: Briefcase,     tone: "purple", to: "/admjudicial/prospecções" },
      { label: "Pendências",        value: pendencias,    icon: AlertTriangle, tone: "orange", to: "/admjudicial/pendencias" },
      { label: "Críticas",          value: bs["erro"] || 0,  icon: AlertTriangle, tone: "red"    },
      { label: "Concluídos (Total)",  value: concluidos,    icon: CheckCircle2,  tone: "green",  to: "/admjudicial/historico" },
      { label: "Score Médio",       value: 74,    icon: Award,         tone: "teal"   },
    ];
  }, [statsData]);

  return (
    <ProfileHome
      defaultName="Administrador"
      subtitle="Painel das empresas prospecção sob sua administração judicial."
      cards={[
        { label: "Empresas Prospecção", desc: "Empresas sob sua administração.",       icon: Building2,     to: "/admjudicial/recuperandas", tone: "blue"   },
        { label: "Prospecções AJ",         desc: "Relatórios mensais em monitoramento.",  icon: Briefcase,     to: "/admjudicial/prospecções",         tone: "purple" },
        { label: "Pendências",   desc: "Documentos aguardando empresas prospecção.",   icon: AlertTriangle, to: "/admjudicial/pendencias",   tone: "red"    },
        { label: "Relatórios",   desc: "Consolidados e exportações.",           icon: FileBarChart,  to: "/admjudicial/relatorios",   tone: "green"  },
        { label: "Histórico",    desc: "Linha do tempo das ações realizadas.",  icon: History,       to: "/admjudicial/historico",    tone: "teal"   },
      ]}
      summary={summary}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "Nova empresa aguardando ativação", sub: "Verifique as empresas pendentes", time: "Agora" },
        { icon: Clock,         tone: "orange", title: "Monitoramento em andamento",    sub: "Pipeline de extração IA ativo", time: "10:30" },
        { icon: FileText,      tone: "blue",   title: "Relatórios disponíveis",        sub: "Consulte a aba de relatórios", time: "Ontem" },
        { icon: CheckCircle2,  tone: "green",  title: "Ciclo de prospecção finalizado",      sub: "Processamento concluído com sucesso", time: "Ontem" },
      ]}
    />
  );
}


