// Normalização e detecção de meses YYYY-MM
const MES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function normalizeMesKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();

  // YYYY-MM
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}`;

  // MM/YYYY ou MM.YYYY ou MM-YYYY
  const m2 = s.match(/^(\d{1,2})[\/.\-](\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;

  // YYYY/MM
  const m3 = s.match(/^(\d{4})[\/.\-](\d{1,2})$/);
  if (m3) return `${m3[1]}-${m3[2].padStart(2, "0")}`;

  return null;
}

export function detectMesFromFilename(name: string): string | null {
  const m = name.match(/(\d{1,2})[-_/.](\d{4})|(\d{4})[-_/.](\d{1,2})/);
  if (!m) return null;
  const mm = m[1] || m[4];
  const yy = m[2] || m[3];
  return `${yy}-${mm.padStart(2, "0")}`;
}

export function mesKeyToLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MES_PT[m - 1]} ${y}`;
}

export function detectDuplicates(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  return counts;
}

export function sortMesKeys(keys: string[]): string[] {
  return [...new Set(keys)].sort();
}
