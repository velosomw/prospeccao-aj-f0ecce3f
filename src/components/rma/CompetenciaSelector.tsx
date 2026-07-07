// Seletor compartilhado de competência (mês/ano).
// Lista os últimos 6 meses disponíveis no consolidado e
// destaca o período "principal" do RMA (definido no cadastro).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

export interface Competencia { ano: number; mes: number; key: string; label: string }

const monthLabel = (a: number, m: number) =>
  new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

const toComp = (ano: number, mes: number): Competencia => ({
  ano, mes,
  key: `${ano}-${String(mes).padStart(2, "0")}`,
  label: monthLabel(ano, mes),
});

interface Props {
  companyId: string | null;
  value: Competencia | null;
  onChange: (p: Competencia | null) => void;
  refreshKey?: string | number;
  maxItems?: number;
  preferredCompetencia?: Competencia | null;
}

export default function CompetenciaSelector({
  companyId, value, onChange, refreshKey, maxItems = 6, preferredCompetencia = null,
}: Props) {
  const [periodos, setPeriodos] = useState<Competencia[]>([]);
  const [rmaPeriodo, setRmaPeriodo] = useState<Competencia | null>(null);

  // Carrega últimos N períodos disponíveis no consolidado + período principal do RMA
  useEffect(() => {
    if (!companyId) { setPeriodos([]); setRmaPeriodo(null); return; }
    let cancelled = false;
    (async () => {
      const [bsRes, dreRes, balRes, compRes] = await Promise.all([
        supabase.from("bs_consolidado")
          .select("ano, mes")
          .eq("company_id", companyId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false })
          .limit(50),
        supabase.from("dre_consolidado")
          .select("ano, mes")
          .eq("company_id", companyId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false })
          .limit(50),
        supabase.from("balancete_consolidado")
          .select("ano, mes")
          .eq("company_id", companyId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false })
          .limit(50),
        supabase.from("companies")
          .select("rma_id, execution_year, current_period_month")
          .eq("id", companyId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const seen = new Set<string>();
      const merged: Competencia[] = [];
      for (const list of [bsRes.data, dreRes.data, balRes.data]) {
        for (const r of (list || []) as Array<{ ano: number; mes: number }>) {
          const key = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(toComp(r.ano, r.mes));
        }
      }
      merged.sort((a, b) => b.key.localeCompare(a.key));
      setPeriodos(merged.slice(0, maxItems));

      if (preferredCompetencia) {
        setRmaPeriodo(preferredCompetencia);
      } else if (compRes.data?.rma_id && /^RMA-DIP-\d{2}-\d{4}$/i.test(String(compRes.data.rma_id))) {
        const [, mm, yyyy] = String(compRes.data.rma_id).match(/^RMA-DIP-(\d{2})-(\d{4})$/i)!;
        setRmaPeriodo(toComp(Number(yyyy), Number(mm)));
      } else if (compRes.data?.execution_year && compRes.data?.current_period_month) {
        setRmaPeriodo(toComp(
          Number(compRes.data.execution_year),
          Number(compRes.data.current_period_month),
        ));
      } else {
        setRmaPeriodo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshKey, maxItems, preferredCompetencia?.key]);

  const isRma = (p: Competencia) =>
    rmaPeriodo && p.ano === rmaPeriodo.ano && p.mes === rmaPeriodo.mes;

  const currentLabel = value ? value.label : "Todos os meses";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
          <span className="capitalize">{currentLabel}</span>
          {value && isRma(value) && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">Prospecção AJ</Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">
          Últimos {maxItems} meses
        </DropdownMenuLabel>
        {periodos.length === 0 && (
          <DropdownMenuItem disabled className="text-xs">
            Sem competências disponíveis
          </DropdownMenuItem>
        )}
        {periodos.map((p) => (
          <DropdownMenuItem
            key={p.key}
            onClick={() => onChange(p)}
            className="text-xs flex items-center justify-between capitalize"
          >
            <span>{p.label}</span>
            {isRma(p) && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">Prospecção AJ</Badge>
            )}
          </DropdownMenuItem>
        ))}
        {rmaPeriodo && !periodos.some(p => isRma(p)) && (
          <DropdownMenuItem
            onClick={() => onChange(rmaPeriodo)}
            className="text-xs flex items-center justify-between capitalize"
          >
            <span>{rmaPeriodo.label}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">Prospecção AJ</Badge>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(null)} className="text-xs">
          Consolidado (todos os meses)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
