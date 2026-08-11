import RoleCadastroPage from "@/components/consultor/RoleCadastroPage";

export default function ConsultorCadastroTecnicos() {
  return (
    <RoleCadastroPage
      role="consultor"
      title="Técnicos"
      subtitle="Corpo técnico BEx cadastrados na plataforma."
      singular="Técnico"
      breadcrumbLabel="Técnicos"
      backTo="/consultor/cadastro"
    />
  );
}