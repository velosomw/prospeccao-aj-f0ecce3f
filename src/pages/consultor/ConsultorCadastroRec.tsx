import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroRec() {
  return (
    <RoleCadastroPage
      role="recuperanda"
      title="Empresas Prospecção"
      subtitle="Usuários com perfil de Empresa Externa cadastrados na platafoprospecção."
      singular="Empresa Prospecção"
      breadcrumbLabel="Empresa Prospecção"
      backTo="/consultor/cadastro"
    />
  );
}
