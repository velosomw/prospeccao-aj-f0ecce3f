import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoBex from "@/assets/logo-bex.png";


const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetSent, setResetSent] = useState(false);
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
        // Fetch role from profile
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Informe o e-mail para recuperar a senha.");
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      setResetSent(true);
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-muted/50 to-background">
      {/* Header simplificado */}
      <header className="bg-white/95 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center px-6 lg:px-12 h-16 lg:h-20">
          <Link to="/" className="flex items-center">
            <img src={logoBex} alt="BEX Auditoria" className="h-8 lg:h-10 w-auto object-contain" />
          </Link>
        </div>
      </header>

      {/* Voltar para Home */}
      <div className="max-w-7xl w-full mx-auto px-6 lg:px-12 pt-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </span>
          Voltar para Home
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(217,91%,50%)] mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Plataforma</h1>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(217,91%,50%)] to-[hsl(200,98%,60%)] bg-clip-text text-transparent">
              Prospeccao IA
            </h2>
          </div>

          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-2xl">
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-sm">E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="empresa@prospeccao.com.br"
                    className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground text-sm">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary pr-10"
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


                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full text-primary-foreground border-0 h-11 text-base font-semibold bg-primary hover:bg-primary/90"
                >
                  {loading ? "Autenticando..." : "Entrar"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-sm text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                {resetSent ? (
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[hsl(152,70%,45%)]/10 mx-auto flex items-center justify-center">
                      <Shield className="w-6 h-6 text-[hsl(152,70%,45%)]" />
                    </div>
                    <h3 className="font-semibold text-foreground">E-mail enviado!</h3>
                    <p className="text-sm text-muted-foreground">
                      Verifique sua caixa de entrada para redefinir a senha.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => { setMode("login"); setResetSent(false); }}
                      className="w-full"
                    >
                      Voltar ao Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="text-center mb-2">
                      <h3 className="font-semibold text-foreground">Recuperar Senha</h3>
                      <p className="text-sm text-muted-foreground">
                        Informe seu e-mail para receber o link de recuperação.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-sm">E-mail</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="empresa@prospeccao.com.br"
                        className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary"
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-primary hover:bg-primary/90 h-11"
                    >
                      {loading ? "Enviando..." : "Enviar Link de Recuperação"}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setMode("login")}
                        className="text-sm text-primary hover:underline"
                      >
                        Voltar ao Login
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
