import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroAJ() {
  return (
    <RoleCadastroPage
      role="admjudicial"
      title="Administradores Judiciais"
      subtitle="Usuários com perfil de Administrador Judicial cadastrados na platafoprospecção."
      singular="Administrador Judicial"
      breadcrumbLabel="Administrador Judicial"
      backTo="/consultor/cadastro"
    />
  );
}
