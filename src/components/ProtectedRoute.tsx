import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";

/**
 * Painel padrão (home) por perfil. Usado para redirecionamentos
 * quando o usuário acessa uma rota não permitida.
 */
export const roleHome: Record<AppRole, string> = {
  gestor_ia: "/gestor-ia",
  coordenador: "/dashboard",
  consultor: "/consultor",
  magistrado: "/magistrado",
  recuperanda: "/prospecção",
  admjudicial: "/admjudicial",
};

export function getRoleHome(roles: AppRole[]): string {
  // Prioridade hierárquica
  const order: AppRole[] = [
    "gestor_ia",
    "coordenador",
    "consultor",
    "magistrado",
    "admjudicial",
    "recuperanda",
  ];
  for (const r of order) {
    if (roles.includes(r)) return roleHome[r];
  }
  return "/login";
}

interface ProtectedRouteProps {
  /** Roles permitidos. Vazio = qualquer usuário autenticado. */
  allow?: AppRole[];
  children: ReactNode;
}

/**
 * Bloqueia o acesso a uma rota baseado em roles.
 * - Sem sessão → /login
 * - Sessão com role incompatível → painel padrão do role
 * - gestor_ia tem acesso a tudo
 */
const ProtectedRoute = ({ allow, children }: ProtectedRouteProps) => {
  const { roles, loading } = useUserRoles();
  const location = useLocation();

  if (loading) return null;

  // Sem nenhum role = não autenticado (ou sem permissão configurada)
  if (roles.length === 0) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Gestor IA acessa tudo
  if (roles.includes("gestor_ia")) return <>{children}</>;

  // Sem restrição = qualquer autenticado
  if (!allow || allow.length === 0) return <>{children}</>;

  const allowed = allow.some((r) => roles.includes(r));
  if (allowed) return <>{children}</>;

  return <Navigate to={getRoleHome(roles)} replace />;
};

export default ProtectedRoute;
