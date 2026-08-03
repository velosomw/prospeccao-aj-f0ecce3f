import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, Save, X } from "lucide-react";
import { toast } from "sonner";

export type CadastroEntityVariant = "recuperanda" | "admjudicial" | "magistrado" | "consultor";

export interface CadastroEntityFormProps {
  backTo: string;
  /** Label do label "Razão Social" (ou "Razão Social / Nome Fantasia") */
  razaoLabel?: string;
  variant?: CadastroEntityVariant;
  onSubmit?: (data: Record<string, string>) => void;
}

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

const inputCls =
  "w-full h-11 px-3.5 rounded-lg border border-border bg-white text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 focus:border-[hsl(217,91%,50%)]";

const Field = ({
  label, name, placeholder, type = "text", required = false, className,
}: { label: string; name: string; placeholder?: string; type?: string; required?: boolean; className?: string }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-foreground mb-1.5">
      {label}{required && <span className="text-[hsl(0,84%,55%)] ml-0.5">*</span>}
    </label>
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
      className={inputCls}
    />
  </div>
);

const SelectField = ({
  label, name, options, required = false, placeholder = "Selecione",
}: { label: string; name: string; options: string[]; required?: boolean; placeholder?: string }) => (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1.5">
      {label}{required && <span className="text-[hsl(0,84%,55%)] ml-0.5">*</span>}
    </label>
    <select name={name} required={required} defaultValue="" className={inputCls}>
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default function CadastroEntityForm({
  backTo, razaoLabel = "Razão Social", variant = "recuperanda", onSubmit,
}: CadastroEntityFormProps) {
  const navigate = useNavigate();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const isMagistrado = variant === "magistrado";
  const isConsultor = variant === "consultor";



  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("Tamanho máximo: 2MB"); return; }
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries()) as Record<string, string>;
    if (onSubmit) onSubmit(data);
    else { toast.success("Cadastro salvo com sucesso"); navigate(backTo); }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-border rounded-2xl p-6 lg:p-8 space-y-7"
    >
      {isMagistrado ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Nome" name="nome" placeholder="Nome do magistrado" required />
          <Field label="Vara" name="vara" placeholder="Ex.: 1ª Vara Empresarial" required />
          <Field label="Órgão / Tribunal" name="orgao" placeholder="Ex.: TJSP" required />
          <SelectField label="Esfera" name="esfera" required options={["Estadual", "Federal", "Trabalhista", "Militar"]} />
          <SelectField label="UF" name="uf" required options={UFS} />
          <Field label="Cidade" name="cidade" placeholder="Cidade" />
          <Field label="E-mail" name="email" type="email" required placeholder="magistrado@tribunal.gov.br" className="md:col-span-2" />
        </div>
      ) : isConsultor ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Nome Completo" name="nome" placeholder="Ex.: João Silva" required />
          <Field label="E-mail Corporativo" name="email" type="email" placeholder="joao@bex.com.br" required />
          <Field label="Telefone/WhatsApp" name="telefone" placeholder="(00) 00000-0000" />
          <Field label="OAB/Registro Profissional" name="registro" placeholder="Ex.: OAB/SP 123456" />
          <SelectField label="Especialidade" name="especialidade" options={["Contábil", "Jurídico", "Financeiro"]} />
        </div>
      ) : (
        <>
          {/* Logotipo */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Logotipo</label>
            <label className="block border-2 border-dashed border-[hsl(217,91%,75%)] rounded-xl px-5 py-5 cursor-pointer hover:bg-[hsl(217,91%,97%)] transition">
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={handleLogo} />
              <div className="flex items-center gap-5">
                <div className="w-28 h-20 rounded-lg bg-[hsl(220,20%,97%)] border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logotipo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground text-center px-1">Sem logotipo</span>
                  )}
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,96%)] flex items-center justify-center flex-shrink-0">
                    <UploadCloud className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Clique para alterar o logotipo</div>
                    <div className="text-xs text-muted-foreground">Formatos permitidos: PNG, JPG ou SVG.</div>
                    <div className="text-xs text-muted-foreground">Tamanho máximo: 2MB.</div>
                  </div>
                </div>
              </div>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              O logotipo será exibido nos relatórios e comunicações do sistema.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label={razaoLabel} name="nome" placeholder="Digite a razão social" required />
            <Field label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" required />
            <Field label="Endereço" name="endereco" placeholder="Rua, número, bairro" className="md:col-span-2" />
            <SelectField label="UF" name="uf" options={UFS} />
            <Field label="Cidade" name="cidade" placeholder="Cidade" />
            <Field label="Responsável Legal" name="responsavel_legal" placeholder="Nome do responsável legal" />
            {variant === "recuperanda" && (
              <Field label="Responsável de Contato" name="contato" placeholder="Nome do contato" />
            )}
            <Field label="Telefone" name="telefone" placeholder="(00) 00000-0000" />
            <Field label="E-mail" name="email" type="email" placeholder="exemplo@dominio.com.br" />
            <Field label="Site" name="site" type="url" placeholder="https://www.exemplo.com.br" className="md:col-span-2" />
          </div>
        </>
      )}


      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-border bg-white text-sm font-semibold text-foreground hover:bg-muted/40"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-[hsl(217,91%,40%)] hover:bg-[hsl(217,91%,35%)] text-white text-sm font-semibold"
        >
          <Save className="w-4 h-4" /> Salvar
        </button>
      </div>
    </form>
  );
}
