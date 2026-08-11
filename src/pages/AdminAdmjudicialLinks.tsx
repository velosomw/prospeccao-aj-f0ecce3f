import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthed } from "@/lib/invokeAuthed";
import PlatformLayout from "@/components/PlatformLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Link2, Unlink, Search, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role?: string;
};

type Link = {
  admjudicial_user_id: string;
  recuperanda_user_id: string;
};

const AdminAdmjudicialLinks = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [admjudiciais, setAdmjudiciais] = useState<Profile[]>([]);
  const [recuperandas, setRecuperandas] = useState<Profile[]>([]);
  const [links, setLinks] = useState<Link[]>([]);

  const [selectedAdm, setSelectedAdm] = useState<string>("");
  const [admSearch, setAdmSearch] = useState("");
  const [recSearch, setRecSearch] = useState("");
  const [selectedRecs, setSelectedRecs] = useState<Set<string>>(new Set());

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: roles, error: rErr }, linksResp] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admjudicial", "recuperanda"]),
        invokeAuthed<{ links: Link[] }>("admin-create-user", {
          body: { action: "list_admjudicial_links" },
        }),
      ]);
      if (rErr) throw rErr;

      const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (pErr) throw pErr;

      const roleMap = new Map<string, string>();
      (roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role));

      const merged: Profile[] = (profiles || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id),
      }));
      const adms = merged.filter((p) => p.role === "admjudicial").sort(byName);
      const recs = merged.filter((p) => p.role === "recuperanda").sort(byName);

      setAdmjudiciais(adms);
      setRecuperandas(recs);
      setLinks(linksResp.data?.links || []);
      if (!selectedAdm && adms.length > 0) setSelectedAdm(adms[0].user_id);
    } catch (e: any) {
      toast.error("Falha ao carregar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedRecsForSelected = useMemo(() => {
    const set = new Set(
      links.filter((l) => l.admjudicial_user_id === selectedAdm).map((l) => l.recuperanda_user_id),
    );
    return set;
  }, [links, selectedAdm]);

  // resetar seleção em lote ao trocar Admjudicial (a seleção é por-Admjudicial)
  useEffect(() => {
    setSelectedRecs(new Set());
  }, [selectedAdm]);

  // garante que seleções fiquem restritas a Recuperandas existentes
  useEffect(() => {
    setSelectedRecs((prev) => {
      const valid = new Set(recuperandas.map((r) => r.user_id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [recuperandas]);

  const filteredAdms = useMemo(
    () => admjudiciais.filter((a) => matches(a, admSearch)),
    [admjudiciais, admSearch],
  );
  const filteredRecs = useMemo(
    () => recuperandas.filter((r) => matches(r, recSearch)),
    [recuperandas, recSearch],
  );

  const linkCountByAdm = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l) => m.set(l.admjudicial_user_id, (m.get(l.admjudicial_user_id) || 0) + 1));
    return m;
  }, [links]);

  const toggleRec = (recId: string) => {
    setSelectedRecs((prev) => {
      const next = new Set(prev);
      next.has(recId) ? next.delete(recId) : next.add(recId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedRecs((prev) => {
      const next = new Set(prev);
      filteredRecs.forEach((r) => next.add(r.user_id));
      return next;
    });
  };
  const deselectAllVisible = () => {
    setSelectedRecs((prev) => {
      const next = new Set(prev);
      filteredRecs.forEach((r) => next.delete(r.user_id));
      return next;
    });
  };
  const clearSelection = () => setSelectedRecs(new Set());

  const visibleSelectedCount = useMemo(
    () => filteredRecs.reduce((acc, r) => acc + (selectedRecs.has(r.user_id) ? 1 : 0), 0),
    [filteredRecs, selectedRecs],
  );
  const allVisibleSelected =
    filteredRecs.length > 0 && visibleSelectedCount === filteredRecs.length;

  const pendingLinkCount = useMemo(
    () => Array.from(selectedRecs).filter((id) => !linkedRecsForSelected.has(id)).length,
    [selectedRecs, linkedRecsForSelected],
  );
  const pendingUnlinkCount = useMemo(
    () => Array.from(selectedRecs).filter((id) => linkedRecsForSelected.has(id)).length,
    [selectedRecs, linkedRecsForSelected],
  );

  const bulkLink = async () => {
    if (!selectedAdm) return toast.error("Selecione um Admjudicial");
    const ids = Array.from(selectedRecs).filter((id) => !linkedRecsForSelected.has(id));
    if (ids.length === 0) return toast.message("Nada para vincular");
    setSaving(true);
    try {
      const results = await Promise.all(
        ids.map((rid) =>
          invokeAuthed("admin-create-user", {
            body: {
              action: "link_admjudicial",
              admjudicial_user_id: selectedAdm,
              recuperanda_user_id: rid,
            },
          }),
        ),
      );
      const fails = results.filter((r) => r.error || (r.data as any)?.error).length;
      toast.success(`Vinculados: ${ids.length - fails}${fails ? ` · falhas: ${fails}` : ""}`);
      await loadAll();
      setSelectedRecs(new Set());
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const bulkUnlink = async () => {
    if (!selectedAdm) return toast.error("Selecione um Admjudicial");
    const ids = Array.from(selectedRecs).filter((id) => linkedRecsForSelected.has(id));
    if (ids.length === 0) return toast.message("Nada para desvincular");
    setSaving(true);
    try {
      const results = await Promise.all(
        ids.map((rid) =>
          invokeAuthed("admin-create-user", {
            body: {
              action: "unlink_admjudicial",
              admjudicial_user_id: selectedAdm,
              recuperanda_user_id: rid,
            },
          }),
        ),
      );
      const fails = results.filter((r) => r.error || (r.data as any)?.error).length;
      toast.success(`Desvinculados: ${ids.length - fails}${fails ? ` · falhas: ${fails}` : ""}`);
      await loadAll();
      setSelectedRecs(new Set());
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const toggleSingle = async (recId: string) => {
    if (!selectedAdm) return;
    const isLinked = linkedRecsForSelected.has(recId);
    setSaving(true);
    try {
      const { data, error } = await invokeAuthed("admin-create-user", {
        body: {
          action: isLinked ? "unlink_admjudicial" : "link_admjudicial",
          admjudicial_user_id: selectedAdm,
          recuperanda_user_id: recId,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(isLinked ? "Desvinculado" : "Vinculado");
      await loadAll();
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-8 w-8 p-0 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Vínculos Admjudicial ↔ Recuperandas</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie quais Recuperandas cada Admjudicial administra (relação N:N).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Admjudiciais */}
            <Card className="lg:col-span-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                  Admjudiciais ({admjudiciais.length})
                </CardTitle>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9"
                    placeholder="Buscar por nome ou e-mail..."
                    value={admSearch}
                    onChange={(e) => setAdmSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[520px]">
                  <div className="divide-y">
                    {filteredAdms.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground">Nenhum encontrado.</div>
                    )}
                    {filteredAdms.map((a) => {
                      const count = linkCountByAdm.get(a.user_id) || 0;
                      const active = a.user_id === selectedAdm;
                      return (
                        <button
                          key={a.user_id}
                          onClick={() => setSelectedAdm(a.user_id)}
                          className={`w-full text-left p-3 flex items-center justify-between transition ${
                            active ? "bg-[hsl(217,91%,50%)]/10 border-l-4 border-[hsl(217,91%,50%)]" : "hover:bg-muted/40"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{a.full_name || "—"}</div>
                            <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                          </div>
                          <Badge variant={count > 0 ? "default" : "outline"} className="shrink-0">
                            {count}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recuperandas + ações */}
            <Card className="lg:col-span-8">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">
                    Recuperandas{" "}
                    {selectedAdm && (
                      <span className="text-xs text-muted-foreground font-normal">
                        ({linkedRecsForSelected.size} vinculadas a este Admjudicial)
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={allVisibleSelected ? deselectAllVisible : selectAllVisible}
                      disabled={filteredRecs.length === 0}
                    >
                      {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection} disabled={selectedRecs.size === 0}>
                      Limpar tudo ({selectedRecs.size})
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9"
                    placeholder="Buscar Recuperanda..."
                    value={recSearch}
                    onChange={(e) => setRecSearch(e.target.value)}
                  />
                </div>
                {selectedRecs.size > 0 && (
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <Badge variant="secondary">
                      {selectedRecs.size} selecionada(s) · {visibleSelectedCount} visíveis
                    </Badge>
                    <Button
                      size="sm"
                      onClick={bulkLink}
                      disabled={saving || !selectedAdm || pendingLinkCount === 0}
                      className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
                    >
                      <Link2 className="w-4 h-4 mr-1" /> Vincular em lote ({pendingLinkCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={bulkUnlink}
                      disabled={saving || !selectedAdm || pendingUnlinkCount === 0}
                    >
                      <Unlink className="w-4 h-4 mr-1" /> Desvincular em lote ({pendingUnlinkCount})
                    </Button>
                  </div>
                )}
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                {!selectedAdm ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Selecione um Admjudicial à esquerda para gerenciar seus vínculos.
                  </div>
                ) : filteredRecs.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Nenhuma Recuperanda encontrada.</div>
                ) : (
                  <VirtualRecList
                    items={filteredRecs}
                    linkedIds={linkedRecsForSelected}
                    selectedIds={selectedRecs}
                    onToggleSelect={toggleRec}
                    onToggleLink={toggleSingle}
                    saving={saving}
                  />
                )}
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                  {filteredRecs.length} resultado(s) · scroll virtual ativo
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PlatformLayout>
  );
};

interface VirtualRecListProps {
  items: Profile[];
  linkedIds: Set<string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleLink: (id: string) => void;
  saving: boolean;
}

const ROW_HEIGHT = 64;

function VirtualRecList({
  items,
  linkedIds,
  selectedIds,
  onToggleSelect,
  onToggleLink,
  saving,
}: VirtualRecListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="h-[480px] overflow-auto">
      <div
        style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const r = items[vRow.index];
          const isLinked = linkedIds.has(r.user_id);
          const checked = selectedIds.has(r.user_id);
          return (
            <div
              key={r.user_id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${vRow.start}px)`,
              }}
              className="px-3 flex items-center gap-3 hover:bg-muted/30 transition border-b"
            >
              <Checkbox checked={checked} onCheckedChange={() => onToggleSelect(r.user_id)} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.full_name || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{r.email}</div>
              </div>
              {isLinked ? (
                <Badge className="bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,32%)]">Vinculada</Badge>
              ) : (
                <Badge variant="outline">Disponível</Badge>
              )}
              <Button
                size="sm"
                variant={isLinked ? "outline" : "default"}
                onClick={() => onToggleLink(r.user_id)}
                disabled={saving}
                className={
                  isLinked ? "" : "bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white"
                }
              >
                {isLinked ? (
                  <>
                    <Unlink className="w-3.5 h-3.5 mr-1" /> Desvincular
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function byName(a: Profile, b: Profile) {
  return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
}
function matches(p: Profile, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    (p.full_name || "").toLowerCase().includes(s) ||
    (p.email || "").toLowerCase().includes(s)
  );
}

export default AdminAdmjudicialLinks;
