// The reference purchase of each rubro: who wins is who gives back the most on it. The person can
// change them, and the browser remembers them (fg_bench_ref, a contract).

export type ReferencePurchases = Readonly<Record<string, number>>;

export const REFERENCE_KEY = "fg_bench_ref";

const OTHERS = "Otros";

export const REFERENCE_DEFAULTS: ReferencePurchases = {
  Supermercados: 150_000,
  Combustible: 60_000,
  "Salud y Bienestar": 40_000,
  [OTHERS]: 50_000,
};

/** The four that can be changed, with what their field says. */
export const REFERENCE_FIELDS = [
  { rubro: "Supermercados", label: "Supermercados" },
  { rubro: "Combustible", label: "Combustible" },
  { rubro: "Salud y Bienestar", label: "Farmacia / salud" },
  { rubro: OTHERS, label: "Resto" },
] as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** What the browser remembers over the defaults; nothing, or something unreadable, is the defaults. */
export function readReferences(stored: string | null): ReferencePurchases {
  try {
    const saved: unknown = JSON.parse(stored ?? "null");
    if (!isRecord(saved)) return REFERENCE_DEFAULTS;
    const amounts = Object.entries(saved).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    );
    return { ...REFERENCE_DEFAULTS, ...Object.fromEntries(amounts) };
  } catch {
    return REFERENCE_DEFAULTS;
  }
}

/** A rubro without its own purchase takes the one of the rest. */
export function referenceOf(
  references: ReferencePurchases,
  rubro: string | null | undefined,
): number {
  const own = references[rubro ?? ""];
  if (own !== undefined && own > 0) return own;
  const others = references[OTHERS];
  return others !== undefined && others > 0 ? others : (REFERENCE_DEFAULTS[OTHERS] ?? 0);
}

/** What was typed, as a whole amount that is never negative. */
export function typedAmount(typed: string): number {
  return Math.max(0, Math.round(Number(typed) || 0));
}
