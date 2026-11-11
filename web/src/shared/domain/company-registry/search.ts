// Search by tax id (from three digits on) or by all the words of the razón social, in any order.
import type { Company } from "./company.ts";
import { digitsOf, normalizeName } from "./text.ts";

const MIN_TAX_ID_DIGITS = 3;
const DEFAULT_LIMIT = 60;
const DOTS = /\./g;

function withoutDots(text: string): string {
  return text.includes(".") ? text.replace(DOTS, "") : text;
}

function hasTaxId({ cuits }: Pick<Company, "cuits">, digits: string): boolean {
  return digits.length >= MIN_TAX_ID_DIGITS && cuits.some((cuit) => cuit.includes(digits));
}

function hasAllWords(name: string, words: readonly string[]): boolean {
  return Boolean(name) && words.every((word) => name.includes(word));
}

/** Dots do not count here: "AMIC S.A." finds "AMIC SA" and the other way around. */
export function searchCompanies<T extends Pick<Company, "empresa" | "cuits">>(
  query: string,
  rows: readonly T[],
  limit: number = DEFAULT_LIMIT,
): T[] {
  const clean = withoutDots(normalizeName(query)).trim();
  if (!clean) return rows.slice(0, limit);
  const digits = digitsOf(query);
  const words = clean.split(" ").filter(Boolean);
  const found: T[] = [];
  for (const row of rows) {
    if (found.length >= limit) break;
    if (hasTaxId(row, digits) || hasAllWords(withoutDots(normalizeName(row.empresa)), words)) {
      found.push(row);
    }
  }
  return found;
}

/**
 * The same criterion, with the dots as they come and giving back the position of each row: in the
 * editor each row keeps editing the same company with a filter on.
 */
export function matchingPositions(
  query: string,
  rows: readonly Pick<Company, "empresa" | "cuits">[],
): number[] {
  const clean = normalizeName(query);
  const all = rows.map((_, position) => position);
  if (!clean) return all;
  const digits = digitsOf(query);
  const words = clean.split(" ").filter(Boolean);
  return all.filter((position) => {
    const row = rows[position];
    return (
      row !== undefined && (hasTaxId(row, digits) || hasAllWords(normalizeName(row.empresa), words))
    );
  });
}
