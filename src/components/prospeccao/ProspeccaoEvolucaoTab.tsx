import { useEffect, useState } from "react";
import { Clock, User, Shield, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ProspeccaoEntry } from "@/types/prospeccao";

interface Props { prospeccao: ProspeccaoEntry }

interface AuditEntry {
  id: string;
  document_id: string | null;
  user_id: string | null;
  user_role: string | null;
  action: "allowed" | "blocked";
  from_status: string | null;
  to_status: string | null;
  motivo: string | null;
  reason: string | null;
  created_at: string;
  section_titulo?: string | null;
  document_titulo?: string | null;
  user_name?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_edicao: "Em edição",
  revisado: "Em revisão",
  aprovado: "Aprovado",
  concluido: "Concluído",
};

const ProspeccaoEvolucaoTab = ({ prospeccao }: Props) => {
  const { id = "" } = useParams();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Documentos do Prospeccao
      const { data: docs } = await supabase
        .from("prospeccao_documents")
        .select("id, titulo")
        .eq("prospeccao_id", id);
      const docIds = (docs || []).map((d) => d.id);
      const docMap = new Map((docs || []).map((d) => [d.id, d.titulo]));
      if (docIds.length === 0) {
        if (!cancelled) { setEntries([]); setLoading(false); }
        return;
      }
      const { data: log } = await supabase
        .from("prospeccao_section_audit_log")
        .select("*")
        .in("document_id", docIds)
        .order("created_at", { ascending: false })
        .limit(80);
      const userIds = Array.from(new Set((log || []).map((l: any) => l.user_id).filter(Boolean)));
      const sectionIds = Array.from(new Set((log || []).map((l: any) => l.section_id).filter(Boolean)));
      const [profilesRes, secsRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        sectionIds.length
          ? supabase.from("prospeccao_document_sections").select("id, titulo, numero").in("id", sectionIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const userMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.full_name || p.email]));
      const secMap = new Map((secsRes.data || []).map((s: any) => [s.id, `${s.numero ? s.numero + " " : ""}${s.titulo}`]));
      if (cancelled) return;
      setEntries(((log || []) as any[]).map((l) => ({
        ...l,
        user_name: l.user_id ? (userMap.get(l.user_id) || l.user_id.slice(0, 8)) : "Sistema",
        section_titulo: secMap.get(l.section_id) || "—",
        document_titulo: docMap.get(l.document_id) || "—",
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Histórico de Revisões — Real ({entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando trilha de auditoria…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma transição de seção registrada ainda. As mudanças de status (pendente → em_edicao → revisado → aprovado → concluído) aparecerão aqui em tempo real.
            </p>
          ) : (
            <div className="space-y-4">
              {entries.map((e, i) => {
                const isCoord = (e.user_role || "").includes("coordenador") || (e.user_role || "").includes("gestor");
                const isBlock = e.action === "blocked";
                return (
                  <div key={e.id} className="relative flex gap-4">
                    {i < entries.length - 1 && (
                      <div className="absolute left-[15px] top-8 w-0.5 h-full bg-border/50" />
                    )}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isBlock ? "bg-[hsl(0,70%,55%)]/15"
                      : isCoord ? "bg-[hsl(217,91%,50%)]/15"
                      : "bg-[hsl(200,98%,55%)]/15"
                    }`}>
                      {isBlock ? <AlertCircle className="w-4 h-4 text-[hsl(0,70%,55%)]" />
                       : isCoord ? <Shield className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                       : <User className="w-4 h-4 text-[hsl(200,98%,55%)]" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{e.user_name}</span>
                        <Badge variant="outline" className="text-[10px]">{e.user_role || "—"}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleString("pt-BR")}
                        </span>
                        {e.action === "allowed" ? (
                          <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-[10px] gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Aplicada
                          </Badge>
                        ) : (
                          <Badge className="bg-[hsl(0,70%,55%)]/15 text-[hsl(0,70%,55%)] border-0 text-[10px]">
                            Bloqueada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground mt-1">
                        {e.document_titulo} · {e.section_titulo}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {STATUS_LABEL[e.from_status || ""] || e.from_status || "—"} → {STATUS_LABEL[e.to_status || ""] || e.to_status || "—"}
                        {e.motivo ? ` · "${e.motivo}"` : ""}
                        {e.reason && e.reason !== "transition_ok" ? ` · ${e.reason}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProspeccaoEvolucaoTab;
