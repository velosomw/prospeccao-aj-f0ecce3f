import { useNavigate } from "react-router-dom";
import { Shield, User, Building2, Scale, Brain, Gavel } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { UserRole } from "@/types/user";
import { motion } from "framer-motion";

const roles: { role: UserRole; icon: typeof Shield; title: string; desc: string; color: string }[] = [
  { role: "coordenador", icon: Shield, title: "Coordenador", desc: "Revisão, aprovação e governança dos Prospecçãos.", color: "hsl(217,91%,50%)" },
  { role: "admjudicial", icon: Gavel, title: "Admjudicial", desc: "Administração das Recuperandas e Prospecçãos entregues.", color: "hsl(280,80%,55%)" },
  { role: "consultor", icon: Building2, title: "Consultor", desc: "Operação e acompanhamento dos Prospecçãos.", color: "hsl(38,92%,50%)" },
  { role: "magistrado", icon: Scale, title: "Magistrado", desc: "Visualização dos processos e relatórios.", color: "hsl(142,76%,36%)" },
  { role: "recuperanda", icon: User, title: "Recuperanda (AJ)", desc: "Consulta de documentos e status.", color: "hsl(200,98%,55%)" },
  { role: "gestor_ia", icon: Brain, title: "Gestor IA", desc: "Administração técnica e integrações.", color: "hsl(258,90%,66%)" },
];

const RoleSelection = () => {
  const { setRole, authenticated } = useUser();
  const navigate = useNavigate();

  if (!authenticated) {
    navigate("/login");
    return null;
  }

  const selectRole = (role: UserRole) => {
    setRole(role);
    if (role === "gestor_ia") navigate("/gestor-ia");
    else if (role === "coordenador") navigate("/dashboard");
    else if (role === "admjudicial") navigate("/admjudicial");
    else if (role === "magistrado") navigate("/magistrado");
    else if (role === "recuperanda") navigate("/recuperanda");
    else navigate("/consultor");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(222,30%,12%)] via-[hsl(220,40%,18%)] to-[hsl(222,25%,15%)] px-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Selecione seu Perfil</h1>
          <p className="text-[hsl(220,15%,55%)]">Escolha como deseja acessar a plataforma Prospecção AJ IA</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map((item, i) => (
            <motion.button
              key={item.role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => selectRole(item.role)}
              className="group bg-[hsl(222,25%,18%)]/80 backdrop-blur-sm border border-[hsl(222,20%,25%)] rounded-2xl p-7 text-left hover:border-[hsl(217,60%,50%)] hover:bg-[hsl(222,25%,20%)]/80 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${item.color}20` }}>
                <item.icon className="w-6 h-6" style={{ color: item.color }} />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
              <p className="text-sm text-[hsl(220,15%,55%)] leading-relaxed">{item.desc}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
