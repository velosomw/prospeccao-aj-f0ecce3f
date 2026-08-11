import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Search, FileText, RefreshCw } from "lucide-react";
import { listMyReleases, listReleases, monthLabel, statusLabel, type RmaRelease } from "@/services/prospecçãoReleaseService";
import { listCompanies, type Company } from "@/services/companiesService";

interface Props {
  scope?: "self" | "all";
  title?: string;
  description?: string;
  showActions?: boolean;
  onOpenReport?: (companyId: string, year: number, month: number) => void;
}

const MyReleasesTab = ({
  scope = "self",
  title = "Prospecçãos Liberados",
  description = "Empresas e períodos disponíveis para visualização.",
  showActions = true,
  onOpenReport,
}: Props) => {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<RmaRelease[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rels, comps] = await Promise.all([
        scope === "all" ? listReleases() : listMyReleases(),
        listCompanies(),
      ]);
      setReleases(rels);
      setCompanies(comps);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [scope]);

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return releases;
    return releases.filter((r) => {
      const c = companiesById.get(r.company_id);
      return [c?.name, c?.prospecção_id, c?.cnpj, monthLabel(r.month), String(r.year)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [releases, search, companiesById]);

  const foprospecçãotDateTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      weekday: "short",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[hsl(217,91%,50%)]" /> {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa, Prospecção AJ, período..."
                className="pl-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {loading ? "Carregando..." : "Nenhuma liberação disponível."}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Prospecção AJ · Empresa</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Período</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Liberado em</th>
                  {showActions && <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const c = companiesById.get(r.company_id);
                  const cfg = statusLabel[r.status];
                  const isActive = r.status === "active";
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c?.prospecção_id && (
                            <Badge className="text-sm font-mono font-semibold bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-0 px-2 py-0.5">
                              {c.prospecção_id}
                            </Badge>
                          )}
                          <span className="text-base font-semibold text-foreground">{c?.name || "Empresa"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] text-sm font-mono border-0 px-2 py-0.5">
                          {monthLabel(r.month)}/{r.year}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {foprospecçãotDateTime(r.created_at)}
                      </td>
                      {showActions && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isActive}
                            className="text-xs gap-1.5"
                            onClick={() =>
                              onOpenReport
                                ? onOpenReport(r.company_id, r.year, r.month)
                                : navigate(`/prospecção/${r.company_id}`)
                            }
                          >
                            <FileText className="w-3.5 h-3.5" /> Relatório
                          </Button>
                        </td>
                      )}
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

export default MyReleasesTab;
