// The same promotion seen through MODO and through the website of the bank counts once, and the one
// of the website stays: it brings the cap and the whole conditions. Same key as claveDup of
// benchmark-sync, plus the level (Macro Selecta Nivel 1…4: same %, days and cards, another cap),
// which keeps them apart: otherwise they were joined into one.
import type { BenchPromotion } from "./rows.ts";

function levelOf(row: BenchPromotion): string {
  return /nivel\s*(\d)/i.exec(`${row.segmento_txt ?? ""} ${row.beneficio ?? ""}`)?.[1] ?? "";
}

export function duplicateKey(row: BenchPromotion): string {
  return [
    row.banco,
    row.marca_clave,
    row.pct ?? "",
    row.cuotas || 0,
    (row.dias_n ?? []).join(""),
    row.credito ? 1 : 0,
    row.debito ? 1 : 0,
    levelOf(row),
  ].join("|");
}

function isFromModo(row: BenchPromotion): boolean {
  return (row.fuente || "modo") === "modo";
}

/** Each promotion once; in a pair, the one that is not from MODO. The first seen keeps its place. */
export function withoutDuplicates(rows: readonly BenchPromotion[]): BenchPromotion[] {
  const kept = new Map<string, BenchPromotion>();
  for (const row of rows) {
    const key = duplicateKey(row);
    const before = kept.get(key);
    if (!before || (isFromModo(before) && !isFromModo(row))) kept.set(key, row);
  }
  return [...kept.values()];
}
