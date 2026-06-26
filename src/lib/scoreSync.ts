// Validação em tempo real de paridade de percentual entre as superfícies que
// exibem o "Score Global do RMA" (Workspace header, Status RMA, Processamento
// IA e Alertas Inteligentes do Dashboard).
//
// Regra: a fonte de verdade é `rma.percentual` (vindo do edge `rma-score`).
// Cada superfície deve renderizar EXATAMENTE esse número. Este helper garante
// isso em runtime: se um cálculo local divergir, emite um aviso no console e
// retorna o valor canônico, evitando que a UI mostre números diferentes.

import { useEffect, useRef } from "react";

const TOLERANCE = 1; // ponto percentual

export function reconcileScore(
  surface: string,
  canonical: number | null | undefined,
  local: number | null | undefined,
): number {
  const c = Math.max(0, Math.min(100, Math.round(Number(canonical) || 0)));
  const l = Math.max(0, Math.min(100, Math.round(Number(local) || 0)));
  if (c > 0 && Math.abs(c - l) > TOLERANCE) {
    // Divergência detectada — força o valor canônico.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        `[scoreSync] divergência em "${surface}": canonical=${c}% vs local=${l}% — usando canonical`,
      );
    }
    return c;
  }
  // Sem canonical confiável (0 ou null), usa o cálculo local como fallback.
  return c > 0 ? c : l;
}

/**
 * Hook que registra o último percentual visto em cada superfície num registry
 * global e dispara aviso se duas superfícies do mesmo RMA divergirem.
 */
const registry: Record<string, Record<string, number>> = {};

export function useScoreParityGuard(rmaId: string | null | undefined, surface: string, value: number) {
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    if (!rmaId) return;
    const v = Math.round(Number(value) || 0);
    if (lastRef.current === v) return;
    lastRef.current = v;
    registry[rmaId] = registry[rmaId] || {};
    registry[rmaId][surface] = v;
    const entries = Object.entries(registry[rmaId]);
    if (entries.length < 2) return;
    const values = entries.map(([, n]) => n);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max - min > TOLERANCE) {
      // eslint-disable-next-line no-console
      console.warn(
        `[scoreSync] percentuais divergentes para RMA ${rmaId}:`,
        Object.fromEntries(entries),
      );
    }
  }, [rmaId, surface, value]);
}
