import { FolderOpen, FileText, FileSpreadsheet, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const docs: any[] = [];

const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  ok:         { label: "Validado",   bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  incompleto: { label: "Incompleto", bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  vazio:      { label: "Vazio",      bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};
const typeIcon: Record<string, any> = { pdf: FileText, excel: FileSpreadsheet };

export default function RecDocumentos() {
  return (
    <ConsultorPageShell
      title="Meus Documentos" subtitle="Documentos enviados ao processo de recuperação judicial."
      kpis={[
        { label: "Total",       value: 60, hint: "Acervo",        icon: FolderOpen,    tone: "blue" },
        { label: "Validados",   value: 38, hint: "63%",           icon: CheckCircle2,  tone: "green" },
        { label: "Incompletos", value: 14, hint: "Reenviar",      icon: AlertTriangle, tone: "orange" },
        { label: "Vazios",      value: 8,  hint: "Pendente",      icon: AlertTriangle, tone: "red" },
        { label: "PDFs",        value: 41, hint: "Documentos",    icon: FileText,      tone: "purple" },
        { label: "Planilhas",   value: 19, hint: "Financeiros",   icon: FileSpreadsheet, tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">Documentos Recentes</h3>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary px-3 py-1.5 rounded-md">
            <Upload className="w-3.5 h-3.5" /> Novo Upload
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Documento</th>
              <th className="text-left px-4 py-2.5">Pasta</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Atualização</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => {
              const Icon = typeIcon[d.tipo];
              const s = statusMeta[d.status];
              return (
                <tr key={d.nome} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /><span className="font-medium">{d.nome}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{d.pasta}</td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{s.label}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.data}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
