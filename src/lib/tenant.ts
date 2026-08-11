/**
 * Tenant scoping para cache multi-tenant.
 *
 * O conceito de "tenant" nesta plataforma é o **Prospeccao / empresa em recuperação**
 * atualmente em foco. A URL /prospecção/:id define o tenant ativo. Para perfis sem
 * tenant fixo (Gestor IA, Coordenador na home), usamos "global".
 *
 * Incluir o tenantId no queryKey isola caches entre clientes/usuários e evita
 * que dados de uma empresa apareçam ao trocar para outra (multi-tab,
 * navegação rápida ou compartilhamento de cliente HTTP entre componentes).
 */
export function getActiveTenantId(): string {
  if (typeof window === "undefined") return "global";
  const path = window.location.pathname;
  // /prospecção/<id> ou /prospecção/<id>/algo
  const m = path.match(/^\/prospecção\/([^/?#]+)/);
  if (m) return `prospecção:${m[1]}`;
  // dashboards globais por perfil
  if (path.startsWith("/dashboard")) return "global:coordenador";
  if (path.startsWith("/consultor")) return "global:consultor";
  if (path.startsWith("/gestor-ia")) return "global:gestor";
  if (path.startsWith("/magistrado")) return "global:magistrado";
  if (path.startsWith("/recuperanda")) return "global:recuperanda";
  if (path.startsWith("/admjudicial")) return "global:admjudicial";
  return "global";
}

/**
 * Hook reativo: re-renderiza componentes quando a URL muda, garantindo
 * que o queryKey acompanhe o tenant ativo.
 */
import { useEffect, useState } from "react";

export function useActiveTenantId(): string {
  const [tenant, setTenant] = useState<string>(() => getActiveTenantId());
  useEffect(() => {
    const sync = () => setTenant(getActiveTenantId());
    window.addEventListener("popstate", sync);
    // patch pushState/replaceState para emitir evento (SPA)
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      sync();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      sync();
      return r;
    };
    return () => {
      window.removeEventListener("popstate", sync);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);
  return tenant;
}
