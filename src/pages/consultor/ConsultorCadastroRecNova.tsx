import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import CadastroEntityForm from "@/components/consultor/CadastroEntityForm";

export default function ConsultorCadastroRecNova() {
  return (
    <CadastroPageShell
      breadcrumb={[
        { label: "Cadastros", to: "/consultor/cadastro" },
        { label: "Recuperandas", to: "/consultor/cadastro/recuperandas" },
        { label: "Nova" },
      ]}
      title="Cadastro de Recuperanda"
      subtitle="Preencha os dados abaixo para cadastrar uma nova empresa em recuperação judicial."
    >
      <CadastroEntityForm backTo="/consultor/cadastro/recuperandas" razaoLabel="Razão Social" />
    </CadastroPageShell>
  );
}
