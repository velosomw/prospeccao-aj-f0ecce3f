import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MathChallenge, { type MathChallengeHandle } from "@/components/MathChallenge";

interface InlineLoginCardProps {
  onClose?: () => void;
}

const InlineLoginCard = ({ onClose }: InlineLoginCardProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const mathRef = useRef<MathChallengeHandle>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mathRef.current?.validate()) {
      toast.error("Verificação matemática incorreta. Tente novamente.");
      mathRef.current?.reset();
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error("Credenciais inválidas. Verifique e-mail e senha.");
        mathRef.current?.reset();
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative w-full max-w-md rounded-2xl p-8 lg:p-10 shadow-2xl backdrop-blur-md border border-white/30"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
    >
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      )}

      <div className="text-center mb-6">
        <h2 className="text-2xl font-display font-bold text-white mb-1">Bem-vindo(a)</h2>
        <p className="text-sm text-white/80">Acesse a Plataforma RMA</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-white/90 text-sm">E-mail</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="empresa@rma.com.br"
            className="bg-white/80 border-white/40 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/90 text-sm">Senha</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-white/80 border-white/40 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <MathChallenge
          ref={mathRef}
          labelClassName="text-white/90 text-sm"
          inputClassName="bg-white/80 border-white/40 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary pr-10"
          iconClassName="text-muted-foreground hover:text-foreground"
        />

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 text-base font-semibold text-white border-0 hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(270, 70%, 50%), hsl(217, 91%, 55%))" }}
        >
          {loading ? "Autenticando..." : "Entrar"}
        </Button>

        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-xs text-white/80 hover:text-white hover:underline transition-colors"
          >
            Esqueci minha senha
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default InlineLoginCard;
