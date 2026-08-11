import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-any";
import { useActiveTenantId } from "@/lib/tenant";

export type AppRole =
  | "gestor_ia"
  | "coordenador"
  | "consultor"
  | "magistrado"
  | "recuperanda"
  | "admjudicial";

export interface UseUserRolesResult {
  roles: AppRole[];
  loading: boolean;
  isGestor: boolean;
  isCoordenador: boolean;
  isConsultor: boolean;
  /** Coordenador OU Gestor IA */
  isCoordOrGestor: boolean;
  /** Originador padrão = Consultor (autor da seção) */
  isOriginador: boolean;
  primary: AppRole | "autenticado";
}

/**
 * Hook compartilhado: usa React Query para deduplicar entre componentes.
 * Em sessões multi-tenant com várias telas, evita N requisições paralelas
 * a /user_roles a cada navegação.
 */
export function useUserRoles(): UseUserRolesResult {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setUserId(session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const tenantId = useActiveTenantId();

  const { data, isLoading } = useQuery({
    // tenantId no key isola cache entre clientes/Prospeccoes e evita vazamento
    // de permissões ao trocar de tenant em multi-tab.
    queryKey: ["user-roles", userId, tenantId],
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId as string);
      return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    },
  });

  const roles: AppRole[] = data ?? [];
  const loading = userId === undefined || (!!userId && isLoading);

  const isGestor = roles.includes("gestor_ia");
  const isCoordenador = roles.includes("coordenador");
  const isConsultor = roles.includes("consultor");
  const isCoordOrGestor = isCoordenador || isGestor;
  const isOriginador = isConsultor || isCoordOrGestor;

  const primary: AppRole | "autenticado" = isGestor
    ? "gestor_ia"
    : isCoordenador
    ? "coordenador"
    : isConsultor
    ? "consultor"
    : roles[0] ?? "autenticado";

  return {
    roles,
    loading,
    isGestor,
    isCoordenador,
    isConsultor,
    isCoordOrGestor,
    isOriginador,
    primary,
  };
}

/* ──────────────────────────────────────────────────────────
 * Matriz de permissões por estado x role
 * ────────────────────────────────────────────────────────── */
export type SectionStatus =
  | "pendente"
  | "em_edicao"
  | "revisado"
  | "aprovado"
  | "concluido";

export interface SectionPermission {
  allowed: boolean;
  reason?: string; // motivo do bloqueio (tooltip)
}

export interface SectionPermissions {
  generateAI: SectionPermission;
  editManually: SectionPermission;
  save: SectionPermission;
  rewriteAI: SectionPermission;
  sendReview: SectionPermission;
  approve: SectionPermission;
  return: SectionPermission;
  conclude: SectionPermission;
  reopen: SectionPermission;
  comment: SectionPermission;
  assign: SectionPermission;
}

const deny = (reason: string): SectionPermission => ({ allowed: false, reason });
const ok: SectionPermission = { allowed: true };

export function getSectionPermissions(
  status: SectionStatus,
  r: Pick<UseUserRolesResult, "isGestor" | "isCoordOrGestor" | "isOriginador" | "isConsultor">,
  hasContent: boolean,
): SectionPermissions {
  const isLocked = status === "concluido";
  const canEditNow = !isLocked && (status === "pendente" || status === "em_edicao");

  return {
    comment: r.isOriginador || r.isCoordOrGestor ? ok : deny("Sem permissão para comentar"),
    assign: r.isCoordOrGestor ? ok : deny("Apenas Coordenador ou Gestor IA pode encaminhar"),

    generateAI: !canEditNow
      ? deny(`Não é possível gerar IA no estado “${status}”`)
      : r.isOriginador
      ? ok
      : deny("Apenas o Originador (Consultor) pode gerar via IA"),

    editManually:
      status !== "pendente"
        ? deny("Edição manual disponível apenas em “pendente”")
        : r.isOriginador
        ? ok
        : deny("Apenas o Originador pode iniciar a edição"),

    save:
      status !== "em_edicao"
        ? deny(`Salvar disponível apenas em “em edição” (atual: ${status})`)
        : r.isOriginador
        ? ok
        : deny("Apenas o Originador pode salvar a edição"),

    rewriteAI:
      status !== "em_edicao"
        ? deny("Refazer IA disponível apenas em “em edição”")
        : r.isOriginador
        ? ok
        : deny("Apenas o Originador pode refazer com IA"),

    sendReview:
      status !== "em_edicao"
        ? deny(`Enviar para revisão exige estado “em edição” (atual: ${status})`)
        : !hasContent
        ? deny("Conteúdo vazio: edite antes de enviar")
        : r.isOriginador
        ? ok
        : deny("Apenas o Originador pode enviar para revisão"),

    approve:
      status !== "revisado"
        ? deny(`Aprovação exige estado “revisado” (atual: ${status})`)
        : r.isCoordOrGestor
        ? ok
        : deny("Apenas Coordenador ou Gestor IA pode aprovar"),

    return:
      status !== "revisado"
        ? deny(`Devolução exige estado “revisado” (atual: ${status})`)
        : r.isCoordOrGestor
        ? ok
        : deny("Apenas Coordenador ou Gestor IA pode devolver"),

    conclude:
      status !== "aprovado"
        ? deny(`Conclusão exige estado “aprovado” (atual: ${status})`)
        : r.isCoordOrGestor
        ? ok
        : deny("Apenas Coordenador ou Gestor IA pode concluir"),

    reopen:
      status !== "aprovado" && status !== "concluido"
        ? deny("Reabertura disponível apenas em “aprovado” ou “concluído”")
        : r.isGestor
        ? ok
        : deny("Apenas Gestor IA pode reabrir"),
  };
}
