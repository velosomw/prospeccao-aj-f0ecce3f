import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import CadastroEntityForm from "@/components/consultor/CadastroEntityForm";

export default function ConsultorCadastroRecNova() {
  return (
    <CadastroPageShell
      breadcrumb={[
        { label: "Cadastro de Perfils", to: "/consultor/cadastro" },
        { label: "Empresa Externa", to: "/consultor/cadastro/recuperandas" },
        { label: "Nova" },
      ]}
      title="Cadastro de Empresa Externa"
      subtitle="Preencha os dados abaixo para cadastrar uma nova empresa externa."
    >
      <CadastroEntityForm backTo="/consultor/cadastro/recuperandas" variant="recuperanda" razaoLabel="Razão Social" />
    </CadastroPageShell>
  );
}
