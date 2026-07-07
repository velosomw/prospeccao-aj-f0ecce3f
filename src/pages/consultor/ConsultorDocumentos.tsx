import { useState } from "react";
import { FolderOpen, FileText, FileSpreadsheet, Image as ImageIcon, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

interface Doc { id: string; nome: string; tipo: "pdf"|"excel"|"imagem"|"doc"; rma: string; empresa: string; pasta: string; status: "ok"|"incompleto"|"vazio"; tamanho: string; data: string; }

const docs: Doc[] = [
  { id: "D-001", nome: "Balanco_2024.pdf",         tipo: "pdf",    rma: "RMA-0012", empresa: "DIPLOMATA", pasta: "P05", status: "ok",         tamanho: "1.2 MB", data: "Há 2h" },
  { id: "D-002", nome: "DRE_05-2025.xlsx",         tipo: "excel",  rma: "RMA-0012", empresa: "DIPLOMATA", pasta: "P07", status: "ok",         tamanho: "320 KB", data: "Há 4h" },
  { id: "D-003", nome: "Contrato_Social.pdf",      tipo: "pdf",    rma: "RMA-0014", empresa: "TECNOMAX",  pasta: "P02", status: "incompleto", tamanho: "780 KB", data: "Há 1d" },
  { id: "D-004", nome: "NF-Servicos_Mai.xlsx",     tipo: "excel",  rma: "RMA-0009", empresa: "BENTOIA",   pasta: "P18", status: "ok",         tamanho: "2.1 MB", data: "Há 1d" },
  { id: "D-005", nome: "Inventario_2024.pdf",      tipo: "pdf",    rma: "RMA-0010", empresa: "AGRIBEN",   pasta: "P31", status: "vazio",      tamanho: "—",      data: "—" },
  { id: "D-006", nome: "Foto_Loja.jpg",            tipo: "imagem", rma: "RMA-0011", empresa: "MOVAG",     pasta: "P40", status: "ok",         tamanho: "640 KB", data: "Há 3d" },
];

const typeIcon: Record<string, any> = { pdf: FileText, excel: FileSpreadsheet, imagem: ImageIcon, doc: FileText };
const typeColor: Record<string, string> = { pdf: "hsl(0,84%,55%)", excel: "hsl(142,76%,40%)", imagem: "hsl(258,90%,55%)", doc: "hsl(217,91%,50%)" };
const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  ok:         { label: "Validado",   bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  incompleto: { label: "Incompleto", bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  vazio:      { label: "Vazio",      bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
};

export default function ConsultorDocumentos() {
  const [search, setSearch] = useState("");
  const rows = docs.filter(d => !search || `${d.nome} ${d.rma} ${d.empresa}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <ConsultorPageShell
      title="Documentos" subtitle="Acervo digital de todos os arquivos processados pela IA."
      search={search} onSearch={setSearch}
      kpis={[
        { label: "Total Indexado", value: 1842, hint: "Em todos Prospecções AJ", icon: FolderOpen,    tone: "blue" },
        { label: "Validados IA",   value: 1670, hint: "90.6%",         icon: CheckCircle2,  tone: "green" },
        { label: "Incompletos",    value: 148,  hint: "Necessita revisão", icon: AlertTriangle, tone: "orange" },
        { label: "Vazios",         value: 24,   hint: "Aguardando upload", icon: AlertTriangle, tone: "red" },
        { label: "PDFs",           value: 1102, hint: "60%",           icon: FileText,      tone: "purple" },
        { label: "Planilhas",      value: 524,  hint: "28%",           icon: FileSpreadsheet, tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Documentos Recentes</h3>
          <span className="text-xs text-muted-foreground">{rows.length} resultados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">Documento</th>
                <th className="text-left px-4 py-2.5">Prospecção AJ</th>
                <th className="text-left px-4 py-2.5">Empresa</th>
                <th className="text-left px-4 py-2.5">Pasta</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Tamanho</th>
                <th className="text-left px-4 py-2.5">Atualização</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const Icon = typeIcon[d.tipo];
                const s = statusMeta[d.status];
                return (
                  <tr key={d.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: typeColor[d.tipo] }} />
                      <span className="font-medium">{d.nome}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-primary">{d.rma}</td>
                    <td className="px-4 py-3">{d.empresa}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.pasta}</td>
                    <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{s.label}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{d.tamanho}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{d.data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
