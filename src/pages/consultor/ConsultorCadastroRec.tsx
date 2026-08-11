import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroRec() {
  return (
    <RoleCadastroPage
      role="recuperanda"
      title="Empresas Prospeccao"
      subtitle="Usuários com perfil de Empresa Externa cadastrados na plataforma."
      singular="Empresa Prospeccao"
      breadcrumbLabel="Empresa Prospeccao"
      backTo="/consultor/cadastro"
    />
  );
}
