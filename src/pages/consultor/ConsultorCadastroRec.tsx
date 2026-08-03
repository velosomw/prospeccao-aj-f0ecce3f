import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroRec() {
  return (
    <RoleCadastroPage
      role="recuperanda"
      title="Empresas Externas"
      subtitle="Usuários com perfil de Empresa Externa cadastrados na plataforma."
      singular="Empresa Externa"
      breadcrumbLabel="Empresa Externa"
      backTo="/consultor/cadastro"
    />
  );
}
