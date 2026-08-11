import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroMag() {
  return (
    <RoleCadastroPage
      role="magistrado"
      title="Magistrados"
      subtitle="Usuários com perfil de Magistrado cadastrados na platafoprospecção."
      singular="Magistrado"
      breadcrumbLabel="Magistrados"
      backTo="/consultor/cadastro"
    />
  );
}
