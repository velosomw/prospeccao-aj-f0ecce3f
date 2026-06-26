/**
 * Leitor simples de planilhas usando a dependência `xlsx` já presente no projeto.
 * Expõe uma matriz 0-indexada por aba para parsers posicionais.
 */
import * as XLSX from "xlsx";

export type Matrix = unknown[][];

export interface ReadWorkbookResult {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  sheetToMatrix: (name: string) => Matrix;
}

export async function readWorkbook(buffer: ArrayBuffer): Promise<ReadWorkbookResult> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  return {
    workbook,
    sheetNames,
    sheetToMatrix: (name: string) => {
      const ws = workbook.Sheets[name];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Matrix;
    },
  };
}