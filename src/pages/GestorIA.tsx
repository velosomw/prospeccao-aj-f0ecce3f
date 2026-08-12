import {
  Brain, Settings, AlertTriangle, FileText, Users, Shield,
  Activity, Cpu, Zap, Award, Bell, MessageCircle, CheckCircle2,
} from "lucide-react";
import ProfileHome from "@/components/shell/ProfileHome";

export default function GestorIA() {
  return (
    <ProfileHome
      defaultName="Gestor IA"
      subtitle="Governança, calibração e telemetria dos agentes inteligentes."
      cards={[
        { label: "Aprendizado IA",    desc: "Treinamento e ground truth dos agentes.",       icon: Brain,         to: "/gestor-ia/aprendizado",     tone: "purple" },
        { label: "Perfil de Agentes", desc: "Configure persona, temperatura e modelo.",      icon: Settings,      to: "/gestor-ia/perfil-agentes",  tone: "blue"   },
        { label: "Failed Jobs",       desc: "Jobs com falha que exigem atenção.",            icon: AlertTriangle, to: "/gestor-ia/failed-jobs",     tone: "red"    },
        { label: "Busca Semântica",   desc: "Vetor de memória corporativa e RAG.",           icon: FileText,      to: "/gestor-ia/busca-semantica", tone: "teal"   },
        { label: "Usuários",          desc: "Gerencie acessos e perfis hierárquicos.",       icon: Users,         to: "/gestor-ia/usuarios",        tone: "green"  },
        { label: "Auditoria",         desc: "Trilha WORM imutável de todas as ações.",       icon: Shield,        to: "/gestor-ia/auditoria",       tone: "amber"  },
      ]}
      summary={[
        { label: "Agentes Ativos",  value: 0,      icon: Brain,         tone: "purple" },
        { label: "Chamadas (24h)",  value: "1.84k", icon: Activity,      tone: "blue"   },
        { label: "Tokens (24h)",    value: "412k",  icon: Cpu,           tone: "purple" },
        { label: "Cache Hit",       value: "62%",   icon: Zap,           tone: "green"  },
        { label: "Failed Jobs",     value: "03",    icon: AlertTriangle, tone: "red"    },
        { label: "Score Global IA", value: 0,      icon: Award,         tone: "green"  },
      ]}
      avisos={[
        { icon: AlertTriangle, tone: "red",    title: "3 jobs falharam no pipeline OCR", sub: "Agente: ocr-vision", time: "10:42" },
        { icon: Zap,           tone: "green",  title: "Cache LLM economizou 38% hoje",   sub: "412k tokens evitados", time: "09:15" },
        { icon: MessageCircle, tone: "purple", title: "Novo prompt validado",            sub: "Agente Auditor IA v2.1", time: "Ontem" },
        { icon: CheckCircle2,  tone: "blue",   title: "Trilha de auditoria selada",      sub: "Bloco #18.422 - SHA-256 OK", time: "Ontem" },
      ]}
    />
  );
}
