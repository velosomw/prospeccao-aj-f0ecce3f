import { Shield, CheckCircle2, AlertTriangle, FileText, Lock, Activity } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const trilha = [
  { id: "AUD-9001", acao: "Aprovação RMA-0012",       autor: "Coordenador",   hash: "0x4a8...e21f", data: "Hoje 14:32" },
  { id: "AUD-9000", acao: "Edição bloco 7 - DRE",      autor: "Ana Silva",     hash: "0x9c2...118a", data: "Hoje 13:10" },
  { id: "AUD-8999", acao: "Reprocessamento IA",        autor: "Sistema",       hash: "0x3f1...87bc", data: "Hoje 11:48" },
  { id: "AUD-8998", acao: "Reprovação bloco 5",        autor: "Coordenador",   hash: "0x7e8...a932", data: "Ontem 17:20" },
  { id: "AUD-8997", acao: "Publicação RMA-0008",       autor: "Julia Pereira", hash: "0x2b4...5c19", data: "Ontem 16:10" },
];

export default function CoordAuditoria() {
  return (
    <ConsultorPageShell
      title="Auditoria" subtitle="Trilha imutável WORM de todas as ações de governança."
      kpis={[
        { label: "Eventos (30d)", value: 412, hint: "Registrados",       icon: Activity,     tone: "blue" },
        { label: "Aprovações",    value: 89,  hint: "Coordenação",       icon: CheckCircle2, tone: "green" },
        { label: "Rejeições",     value: 14,  hint: "Para revisão",      icon: AlertTriangle, tone: "red" },
        { label: "Documentos",    value: 1842, hint: "Indexados",        icon: FileText,     tone: "purple" },
        { label: "Hash Chain",    value: "OK", hint: "Integridade",      icon: Lock,         tone: "green" },
        { label: "Compliance",    value: "100%", hint: "WORM",           icon: Shield,       tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Trilha de Auditoria (WORM)</h3>
          <span className="ml-auto text-[10px] font-bold text-green-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> CADEIA ÍNTEGRA
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">ID</th>
              <th className="text-left px-4 py-2.5">Ação</th>
              <th className="text-left px-4 py-2.5">Autor</th>
              <th className="text-left px-4 py-2.5">Hash</th>
              <th className="text-left px-4 py-2.5">Quando</th>
            </tr>
          </thead>
          <tbody>
            {trilha.map(t => (
              <tr key={t.id} className="border-t hover:bg-muted/20 font-mono text-xs">
                <td className="px-4 py-3 text-primary font-semibold">{t.id}</td>
                <td className="px-4 py-3 font-sans">{t.acao}</td>
                <td className="px-4 py-3 font-sans">{t.autor}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.hash}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
