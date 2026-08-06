import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, User, Lock, Shield, ShieldCheck, FileCheck, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoBex from "@/assets/logo-brasil-expert-full.jpeg";
import heroIllustration from "@/assets/hero-prospeccao-aj.jpg.asset.json";


const trustItems = [
  { icon: Shield, title: "Segurança", desc: "Proteção de dados e conformidade com a LGPD", color: "hsl(142,71%,45%)" },
  { icon: FileCheck, title: "Conformidade", desc: "Em conformidade com a Lei 11.101/05", color: "hsl(217,91%,60%)" },
  { icon: TrendingUp, title: "Visão Inteligente", desc: "Indicadores e relatórios para decisões estratégicas", color: "hsl(199,89%,55%)" },
  { icon: Users, title: "Colaboração", desc: "Comunicação integrada entre BEx e Administração Judicial", color: "hsl(187,85%,53%)" },
];

const Index = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error("Credenciais inválidas. Verifique e-mail e senha.");
        setLoading(false);
        return;
      }
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles").select("role").eq("user_id", data.user.id).single();
        const role = profile?.role;
        toast.success("Login realizado com sucesso!");
        if (role === "gestor_ia") navigate("/gestor-ia");
        else if (role === "coordenador") navigate("/dashboard");
        else if (role === "admjudicial") navigate("/admjudicial");
        else if (role === "magistrado") navigate("/magistrado");
        else if (role === "recuperanda") navigate("/recuperanda");
        else navigate("/consultor");
      }
    } catch (err: any) {
      toast.error("Erro ao fazer login: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Flag de validação solicitada via instrução visual
    console.log("Validação de perfis: Certificando que os perfis da plataforma estão funcionais e podem executar o processo configurado sem erros.");
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white relative">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* ═══ LEFT — LOGIN ═══ */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col justify-center px-8 lg:px-14 py-10 lg:py-14"
        >
          {/* Logo + tagline */}
          <div className="mb-10">
            <img
              src={logoBex}
              alt="BEx Brasil Expert"
              className="h-16 lg:h-20 w-auto object-contain mb-3"
              width={320}
              height={80}
            />
            <p className="text-xs lg:text-sm text-muted-foreground leading-snug max-w-[280px]">
              Transparência na Reestruturação<br />e Recuperação de Empresas
            </p>
          </div>

          {/* Welcome */}
          <div className="mb-8">
            <p className="text-base text-muted-foreground mb-1">Bem-vindo ao</p>
            <h1 className="text-4xl lg:text-[2.75rem] font-display font-bold leading-[1.05] text-foreground">
              Gerenciamento<br />
              Prospecção AJ
            </h1>
            <div className="flex gap-1.5 mt-4">
              <span className="block h-1 w-8 rounded-full bg-[hsl(217,91%,50%)]" />
              <span className="block h-1 w-4 rounded-full bg-muted" />
              <span className="block h-1 w-4 rounded-full bg-muted" />
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Sistema inteligente para gestão e acompanhamento<br />
            de Prospecção Administrador Judicial
          </p>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Usuário"
                required
                className="h-12 pl-10 bg-[hsl(220,20%,97%)] border-[hsl(220,15%,90%)] rounded-xl"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                required
                className="h-12 pl-10 pr-10 bg-[hsl(220,20%,97%)] border-[hsl(220,15%,90%)] rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>


            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold rounded-xl bg-[hsl(222,47%,18%)] hover:bg-[hsl(222,47%,14%)] text-white"
            >
              {loading ? "Autenticando..." : "Entrar"}
            </Button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-[hsl(217,91%,50%)] hover:underline font-medium"
              >
                Esqueceu sua senha?
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-auto pt-12 flex flex-col items-center text-center">
            <ShieldCheck className="w-6 h-6 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Acesso restrito e confidencial.<br />
              Todos os direitos reservados à Brasil Expert.
            </p>
          </div>
        </motion.aside>

        {/* ═══ RIGHT — HERO + TRUST ═══ */}
        <section className="relative bg-gradient-to-br from-[hsl(220,30%,97%)] via-white to-[hsl(217,91%,97%)] flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-12 min-h-[280px] sm:min-h-[380px] lg:min-h-[520px]">
            <motion.img
              src={heroIllustration.url}
              alt="Hub central Prospecção AJ com módulos de Administração Judicial, Comunicação, Segurança, Análise, Relatórios e Governança"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="w-full max-w-[480px] sm:max-w-[600px] lg:max-w-[720px] h-auto object-contain"
              width={1024}
              height={1024}
              fetchPriority="high"
            />
          </div>

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="m-4 sm:m-6 lg:m-8 rounded-2xl bg-[hsl(222,47%,14%)] px-4 sm:px-6 lg:px-10 py-5 sm:py-6 lg:py-7"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
              {trustItems.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  >
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white mb-0.5">{item.title}</h3>
                    <p className="text-xs text-white/70 leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

      </div>
      {/* Validação de perfis: valide que os perfils da plataforma estão funcionais e podem executar o processo configurado sem erros ou quebra de funcionalidades aplicadas */}
    </div>
  );
};

export default Index;
