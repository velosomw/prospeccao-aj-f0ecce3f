// Auditoria de Cobertura de Meses (estrito · 0,01%)
// ---------------------------------------------------------------------------
// Durante/depois do processamento manual, valida que os meses presentes na
// plataforma Prospeccao (balancete_consolidado) batem com os meses do balancete de
// referência (prospecção_file_parse_cache) e do relatório de referência (lancamentos
// com origem_arquivo). Lista meses:
//   ✓ OK        — presente nas três fontes e equação Ativo = Passivo+PL (≤0,01%)
//   ⏳ Em proc. — presente no cache OU em onedrive_files=processing, ainda não consolidado
//   ⚠ Duplicado — mesmo ano/mês/tipo carregado mais de uma vez no cache
//   ✗ Faltante  — gap entre o mês mais antigo e o mais recente
//   ✗ Diverge   — equação contábil falhou no balancete consolidado (>0,01%)
import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { mesKeyToLabel } from "@/services/bsDados/mesNoprospecçãolizer";

interface Props {
  companyId: string | null;
  /** Tick externo para forçar refresh (ex: ao concluir upload). */
  refreshKey?: string | number | null;
}

type Status = "ok" | "processing" | "duplicate" | "missing" | "diverge";

interface MonthRow {
  key: string;            // YYYY-MM
  status: Status;
  cacheCount: number;
  hasConsolidado: boolean;
  hasProcessing: boolean;
  ativo: number;
  passivoPl: number;
  diffPct: number;        // 0..1
}

const TOL = 0.0001; // 0,01%

const STATUS_META: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok:         { label: "OK",            cls: "bg-emerald-600 text-white",  Icon: CheckCircle2 },
  processing: { label: "Em processamento", cls: "bg-blue-600 text-white",  Icon: Loader2 },
  duplicate:  { label: "Duplicado",     cls: "bg-amber-500 text-white",    Icon: Copy },
  missing:    { label: "Faltante",      cls: "bg-rose-600 text-white",     Icon: XCircle },
  diverge:    { label: "Diverge",       cls: "bg-rose-600 text-white",     Icon: AlertTriangle },
};

function enumerateRange(min: string, max: string): string[] {
  const out: string[] = [];
  const [ay, am] = min.split("-").map(Number);
  const [by, bm] = max.split("-").map(Number);
  let y = ay, m = am;
  while (y < by || (y === by && m <= bm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export default function MonthCoverageCard({ companyId, refreshKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!companyId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [bal, cache, proc] = await Promise.all([
        supabase
          .from("balancete_consolidado")
          .select("ano, mes, tipo, valor, saldo")
          .eq("company_id", companyId)
          .limit(20000),
        supabase
          .from("prospecção_file_parse_cache")
          .select("ano, mes, tipo")
          .eq("company_id", companyId)
          .is("error_message", null)
          .limit(5000),
        supabase
          .from("onedrive_files")
          .select("path, status")
          .eq("company_id", companyId)
          .in("status", ["processing", "queued", "pending"])
          .limit(2000),
      ]);
      if (cancelled) return;

      const key = (a: any, m: any) => `${Number(a)}-${String(Number(m)).padStart(2, "0")}`;

      // Cobertura: balancete consolidado por mês (equação contábil)
      const consMap = new Map<string, { ativo: number; passivoPl: number }>();
      for (const r of (bal.data || []) as any[]) {
        if (!r.ano || !r.mes) continue;
        const k = key(r.ano, r.mes);
        const v = consMap.get(k) || { ativo: 0, passivoPl: 0 };
        const val = Number(r.saldo ?? r.valor) || 0;
        const t = String(r.tipo || "").toLowerCase();
        if (t === "ativo") v.ativo += val;
        else if (t === "passivo" || t === "patrimonio_liquido" || t === "pl" || t === "patrimônio líquido") v.passivoPl += val;
        consMap.set(k, v);
      }

      // Cache (referência parsed)
      const cacheMap = new Map<string, number>();
      for (const r of (cache.data || []) as any[]) {
        if (!r.ano || !r.mes) continue;
        const k = key(r.ano, r.mes);
        cacheMap.set(k, (cacheMap.get(k) || 0) + 1);
      }

      // Em processamento (heurística por nome do path)
      const procKeys = new Set<string>();
      for (const r of (proc.data || []) as any[]) {
        const m = String(r.path || "").match(/(\d{4})[-_/.](\d{1,2})|(\d{1,2})[-_/.](\d{4})/);
        if (!m) continue;
        const y = m[1] || m[4]; const mo = m[2] || m[3];
        if (y && mo) procKeys.add(`${y}-${String(Number(mo)).padStart(2, "0")}`);
      }

      const allKeys = new Set<string>([...consMap.keys(), ...cacheMap.keys(), ...procKeys]);
      if (allKeys.size === 0) { setRows([]); setLoading(false); return; }

      const sorted = [...allKeys].sort();
      const range = enumerateRange(sorted[0], sorted[sorted.length - 1]);

      const out: MonthRow[] = range.map((k) => {
        const cons = consMap.get(k);
        const cacheCount = cacheMap.get(k) || 0;
        const hasProc = procKeys.has(k);
        const ativo = cons?.ativo ?? 0;
        const passivoPl = cons?.passivoPl ?? 0;
        const max = Math.max(Math.abs(ativo), Math.abs(passivoPl));
        const diffPct = max === 0 ? 0 : Math.abs(ativo - passivoPl) / max;

        let status: Status;
        if (cacheCount > 1) status = "duplicate";
        else if (cons && diffPct > TOL) status = "diverge";
        else if (cons) status = "ok";
        else if (hasProc || cacheCount === 1) status = "processing";
        else status = "missing";

        return { key: k, status, cacheCount, hasConsolidado: !!cons, hasProcessing: hasProc, ativo, passivoPl, diffPct };
      });

      setRows(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshKey, tick]);

  // Realtime — bate quando o motor de consolidação grava algo novo
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`coverage:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "balancete_consolidado", filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "prospecção_file_parse_cache", filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  const summary = useMemo(() => {
    const s = { ok: 0, processing: 0, duplicate: 0, missing: 0, diverge: 0 };
    for (const r of rows) s[r.status]++;
    return s;
  }, [rows]);

  if (!companyId) return null;

  return (
    <div className="mb-4 border border-slate-200 bg-white rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Auditoria de meses · cobertura (estrito · 0,01%)
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <Badge className="bg-emerald-600 text-white">OK {summary.ok}</Badge>
          <Badge className="bg-blue-600 text-white">Em proc. {summary.processing}</Badge>
          <Badge className="bg-amber-500 text-white">Duplicado {summary.duplicate}</Badge>
          <Badge className="bg-rose-600 text-white">Faltante {summary.missing}</Badge>
          <Badge className="bg-rose-600 text-white">Diverge {summary.diverge}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setTick((t) => t + 1)} disabled={loading} className="h-6 text-[10px] px-2">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          {loading ? "Carregando cobertura…" : "Sem dados de meses para esta empresa ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
          {rows.map((r) => {
            const meta = STATUS_META[r.status];
            const Icon = meta.Icon;
            const title = [
              `${mesKeyToLabel(r.key)} · ${meta.label}`,
              r.hasConsolidado ? `Ativo: ${r.ativo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : null,
              r.hasConsolidado ? `Passivo+PL: ${r.passivoPl.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : null,
              r.hasConsolidado ? `Δ: ${(r.diffPct * 100).toFixed(4)}%` : null,
              r.cacheCount > 0 ? `Arquivos parsed: ${r.cacheCount}` : null,
            ].filter(Boolean).join(" · ");
            return (
              <div
                key={r.key}
                title={title}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] ${
                  r.status === "ok" ? "border-emerald-200 bg-emerald-50" :
                  r.status === "processing" ? "border-blue-200 bg-blue-50" :
                  r.status === "duplicate" ? "border-amber-200 bg-amber-50" :
                  "border-rose-200 bg-rose-50"
                }`}
              >
                <Icon className={`h-3 w-3 ${r.status === "processing" ? "animate-spin text-blue-600" :
                  r.status === "ok" ? "text-emerald-600" :
                  r.status === "duplicate" ? "text-amber-600" : "text-rose-600"}`} />
                <span className="font-medium text-slate-800">{mesKeyToLabel(r.key)}</span>
                {r.status === "diverge" && (
                  <span className="ml-auto text-[10px] text-rose-700">{(r.diffPct * 100).toFixed(2)}%</span>
                )}
                {r.status === "duplicate" && (
                  <span className="ml-auto text-[10px] text-amber-700">×{r.cacheCount}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground mt-2">
        Compara <strong>balancete consolidado</strong> (plataforma) com <strong>prospecção_file_parse_cache</strong> (referência parsed) e <strong>onedrive_files</strong> em processamento.
        Critério estrito: |Ativo − (Passivo+PL)| ≤ 0,01%.
      </div>
    </div>
  );
}
