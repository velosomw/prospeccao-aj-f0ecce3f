import {
  FolderOpen, AlertTriangle, FileBarChart, Calendar, MessageCircle,
  Upload, FileText, CheckCircle2, Award, Bell, Clock,
} from "lucide-react";
import ProfileHome from "@/components/shell/ProfileHome";

export default function RecuperandaDashboard() {
  return (
    <ProfileHome
      defaultName="Empresa Prospeccao"
      subtitle="Acompanhe seu processo e envio de documentos."
      cards={[
        { label: "Documentos",  desc: "Acervo de documentos enviados.",         icon: FolderOpen,    to: "/recuperanda/documentos",  tone: "blue"   },
        { label: "Pendências",  desc: "Documentos que faltam enviar.",          icon: AlertTriangle, to: "/recuperanda/pendencias",  tone: "red"    },
        { label: "Relatórios",  desc: "Prospeccoes AJ publicadas sobre sua empresa.",     icon: FileBarChart,  to: "/recuperanda/relatorios",  tone: "green"  },
        { label: "Cronograma",  desc: "Prazos do processo de prospeccao.",        icon: Calendar,      to: "/recuperanda/cronograma",  tone: "purple" },
        { label: "Upload",      desc: "Envie novos documentos agora.",          icon: Upload,        to: "/recuperanda/documentos",  tone: "teal"   },
      ]}
      summary={[
        { label: "Score Saúde",     value: 72,   icon: Award,         tone: "green"  },
        { label: "Documentos",      value: 60,   icon: FileText,      tone: "blue"   },
        { label: "Pendências",      value: 14,   icon: AlertTriangle, tone: "orange", to: "/recuperanda/pendencias" },
        { label: "Próximo Prazo",   value: "8d", icon: Calendar,      tone: "blue"    },
        { label: "Prospeccoes AJ Publicados", value: "04", icon: CheckCircle2,  tone: "green"  },
        { label: "Uploads (30d)",   value: 47,   icon: Upload,        tone: "purple" },
      ]}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "Envie o Balancete de Maio/2026", sub: "Vencimento em 8 dias", time: "Hoje" },
        { icon: Clock,         tone: "orange", title: "DRE 04/2026 aguardando revisão", sub: "Status: pendente assinatura", time: "Ontem" },
        { icon: MessageCircle, tone: "blue",   title: "Nova mensagem do AJ",            sub: "Sobre conciliação bancária", time: "Ontem" },
        { icon: CheckCircle2,  tone: "green",  title: "Prospeccao AJ 03/2026 aprovado",           sub: "Publicado no processo", time: "12/06" },
      ]}
    />
  );
}
