import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useCompaniesPage } from "@/hooks/useCompaniesPage";
import PlatformLayout from "@/components/PlatformLayout";

/**
 * Entry point "Processo Prospecção" — abre direto o Workspace
 * usando a primeira empresa atribuída ao usuário.
 */
export default function ProcessoProspeccao() {
  const navigate = useNavigate();
  const { data, isLoading } = useCompaniesPage({
    mode: "assigned",
    page: 1,
    pageSize: 1,
    search: "",
    status: null,
  });

  const first = data?.rows?.[0];
  const targetId = first?.rma_id || first?.id;

  useEffect(() => {
    if (!isLoading && targetId) {
      navigate(`/rma/${targetId}`, { replace: true });
    }
  }, [isLoading, targetId, navigate]);

  if (!isLoading && !targetId) {
    return (
      <PlatformLayout>
        <div className="p-10 text-center text-muted-foreground">
          Nenhum processo de prospecção disponível ainda.
        </div>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <div className="p-10 text-center text-muted-foreground">Abrindo workspace…</div>
    </PlatformLayout>
  );
}
