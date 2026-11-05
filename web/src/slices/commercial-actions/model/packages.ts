import { normalizeName } from "@/shared/domain/company-registry/index.ts";

const NOT_LETTER = /[^a-z ]/g;
const BLANKS = /\s+/g;
const PACKAGE_WORD = /^paquete /;

const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/^(caja( de ahorros?)?|ca)$/, "caja"],
  [/^sin paquete( caja( de ahorros?)?)?$/, "caja"],
  [/^plus$/, "plus"],
  [/^(plus )?gold$/, "gold"],
  [/^(eminent )?(platinum|platino)$/, "platinum"],
  [/^(eminent )?black$/, "black"],
];

/**
 * The cell has to be only the package ("Plus Gold", "Paquete Black", "CA"), so as not to take a
 * surname for a package.
 */
export function packageOf(text: unknown): string | null {
  const clean = normalizeName(text)
    .replace(NOT_LETTER, " ")
    .replace(BLANKS, " ")
    .trim()
    .replace(PACKAGE_WORD, "");
  if (!clean) return null;
  return PATTERNS.find(([pattern]) => pattern.test(clean))?.[1] ?? null;
}

interface PersonPackage {
  readonly estado: string;
  readonly paquete?: string | null;
}

/** "3 con paquete · 1 sin paquete" of a list of people. */
export function packagesSummary(people: readonly PersonPackage[]): string {
  const signups = people.filter(({ estado }) => estado === "alta");
  if (signups.length === 0) return "sueldos en Galicia";
  const without = signups.filter(({ paquete }) => paquete === "caja").length;
  const withOne = signups.filter(({ paquete }) => paquete && paquete !== "caja").length;
  const unknown = signups.length - withOne - without;
  const end = unknown ? ` · ${String(unknown)} sin cargar` : "";
  return `${String(withOne)} con paquete · ${String(without)} sin paquete${end}`;
}
