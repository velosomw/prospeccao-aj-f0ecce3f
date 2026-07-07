import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowRightLeft, History, Search, UserPlus, UserMinus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listRmaHistory, listCompanies, type Company, type RmaHistoryEntry } from "@/services/companiesService";

type ProfileLite = { user_id: string; full_name: string; email: string };

interface Props {
  title?: string;
  description?: string;
  limit?: number;
}

const actionConfig: Record<RmaHistoryEntry["action"], { label: string; color: string; Icon: any }> = {
  assign:   { label: "Atribuição",  color: "hsl(142,76%,36%)", Icon: UserPlus },
  move:     { label: "Movimentação", color: "hsl(217,91%,50%)", Icon: ArrowRightLeft },
  unassign: { label: "Desvínculo",  color: "hsl(0,70%,55%)",   Icon: UserMinus },
};

const RmaMovementHistory = ({ title = "Histórico de Movimentações de RMA", description, limit = 200 }: Props) => {
  const [entries, setEntries] = useState<RmaHistoryEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | RmaHistoryEntry["action"]>("all");

  const load = async () => {
    setLoading(true);
    try {
      const [hist, comps] = await Promise.all([listRmaHistory({ limit }), listCompanies()]);
      setEntries(hist);
      setCompanies(comps);

      // Busca perfis envolvidos para resolver nomes
      const ids = new Set<string>();
      hist.forEach((e) => {
        if (e.from_consultant_user_id) ids.add(e.from_consultant_user_id);
        if (e.to_consultant_user_id) ids.add(e.to_consultant_user_id);
        if (e.changed_by) ids.add(e.changed_by);
      });
      if (ids.size > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", Array.from(ids));
        setProfiles((data || []) as ProfileLite[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const p = profilesById.get(id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.action !== filter) return false;
      if (!q) return true;
      const c = companiesById.get(e.company_id);
      const txt = [
        c?.name, c?.rma_id, c?.cnpj,
        nameOf(e.from_consultant_user_id),
        nameOf(e.to_consultant_user_id),
        nameOf(e.changed_by),
      ].filter(Boolean).join(" ").toLowerCase();
      return txt.includes(q);
    });
  }, [entries, search, filter, companiesById, profilesById]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const counts = useMemo(() => ({
    total: entries.length,
    assign: entries.filter((e) => e.action === "assign").length,
    move: entries.filter((e) => e.action === "move").length,
    unassign: entries.filter((e) => e.action === "unassign").length,
  }), [entries]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-[hsl(217,91%,50%)]" /> {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por empresa, ID Prospecção AJ, consultor ou responsável..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {([
              ["all", `Todas (${counts.total})`],
              ["move", `Movimentações (${counts.move})`],
              ["assign", `Atribuições (${counts.assign})`],
              ["unassign", `Desvínculos (${counts.unassign})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  filter === key
                    ? "bg-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)] text-white"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ação</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa Prospecção AJ</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Movimento</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const c = companiesById.get(e.company_id);
                  const cfg = actionConfig[e.action];
                  const Icon = cfg.Icon;
                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(e.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                          style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color }}
                        >
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{c?.name || "Empresa removida"}</span>
                          {c?.rma_id && (
                            <Badge variant="outline" className="text-[10px] font-mono w-fit mt-0.5">
                              {c.rma_id}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-muted-foreground">{nameOf(e.from_consultant_user_id)}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">{nameOf(e.to_consultant_user_id)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">{nameOf(e.changed_by)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RmaMovementHistory;
