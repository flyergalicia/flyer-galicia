// The category of a company (combustible, supermercado or both) and its caps. What does not change
// from one campaign to the next is the category; the flyer does, so a company goes to whichever
// flyer is in force for its category, without touching any of its data.
import { formatAmount } from "@/shared/flyer-engine/amounts.ts";
import {
  currentOption,
  type FlyerOption,
  optionLabel,
  optionNumber,
} from "@/shared/domain/flyer-options.ts";
import { type Company, type CompanyCategory, sanitizeCategory } from "./company.ts";
import { digitsOf, normalizeName } from "./text.ts";

export type CategoryKind = "combustible" | "supermercado" | "ambos" | "";

/** The two caps with their names, as the sheet and the editor show them. */
export interface NamedCaps {
  readonly fuel: string;
  readonly grocery: string;
}

export type Options = readonly FlyerOption[];

const NOT_A_CATEGORY = new Set(["", "-", "no", "sin rubro"]);
const ONLY_DIGITS = /^\d+$/;
const FUEL_WORDS = ["combustible", "nafta", "estacion"];
const GROCERY_WORDS = ["super", "hiper", "mercado"];

function hasAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** "Súper y combustible 2027" is both. */
export function kindOfText(text: unknown): CategoryKind {
  const clean = normalizeName(text);
  if (!clean) return "";
  const fuel = hasAny(clean, FUEL_WORDS);
  const grocery = hasAny(clean, GROCERY_WORDS);
  if (clean.includes("ambos") || (fuel && grocery)) return "ambos";
  if (fuel) return "combustible";
  return grocery ? "supermercado" : "";
}

export function kindOfOption(option: number, options: Options): CategoryKind {
  const known = options.find(({ n }) => n === optionNumber(options, option));
  if (!known || known.rubro === "ninguno") return "";
  return known.rubro || kindOfText(known.nombre);
}

export function categoryOptions(options: Options): readonly number[] {
  return options.filter(({ solapa }) => solapa === "rubros").map(({ n }) => n);
}

/** The flyer in force for a kind: the last one the administrator left on the bar. */
export function activeOptionOfKind(kind: CategoryKind, options: Options): number {
  if (!kind) return 0;
  const candidates = options.filter(
    ({ solapa, n }) =>
      solapa === "rubros" && kindOfOption(n, options) === kind && currentOption(options, n) === n,
  );
  const sorted = candidates.toSorted((one, other) => one.orden - other.orden || one.n - other.n);
  return sorted.at(-1)?.n ?? 0;
}

function isKnown(option: number, options: Options): boolean {
  return options.some(({ n }) => n === option);
}

/** From its saved option, even of an old campaign; if that one is gone, from the text it had. */
export function kindOfCategory(category: unknown, options: Options): CategoryKind {
  const { opcion, txt } = sanitizeCategory(category);
  const current = currentOption(options, opcion);
  const kind = current && isKnown(current, options) ? kindOfOption(current, options) : "";
  return kind || kindOfText(txt);
}

/** Which flyer a company goes to. If nothing can be deduced, the saved one along its successors. */
export function optionOfCategory(category: unknown, options: Options): number {
  const { opcion } = sanitizeCategory(category);
  return (
    activeOptionOfKind(kindOfCategory(category, options), options) || currentOption(options, opcion)
  );
}

/** "Ambos", "combustible" or "5": the number of an option of Rubros; 0 when none matches. */
export function optionOfText(text: unknown, options: Options): number {
  const clean = normalizeName(text);
  if (NOT_A_CATEGORY.has(clean)) return 0;
  const list = categoryOptions(options);
  if (ONLY_DIGITS.test(clean)) {
    const number = Number.parseInt(clean, 10);
    return list.includes(number) ? currentOption(options, number) : 0;
  }
  const labels = list.map((n) => ({ n, label: normalizeName(optionLabel(options, n)) }));
  const found =
    labels.find(({ label }) => label === clean) ??
    labels.find(({ label }) => label.includes(clean) || clean.includes(label));
  return found ? currentOption(options, found.n) : 0;
}

/** The flyer in force with its caps. The name of an old campaign would only confuse. */
export function categoryLabel(category: unknown, options: Options): string {
  const clean = sanitizeCategory(category);
  const option = optionOfCategory(clean, options);
  if (!option) return "";
  const label = optionLabel(options, option);
  const first = formatAmount(clean.importe);
  const second = formatAmount(clean.importe2);
  const differ = Boolean(second) && second !== first;
  if (first && differ && kindOfCategory(clean, options) === "ambos") {
    return `${label} · súper ${first} · combustible ${second}`;
  }
  if (!first) return label;
  return `${label} · ${first}${differ ? ` / ${second}` : ""}`;
}

export function companyCategoryLabel({ rubro }: Pick<Company, "rubro">, options: Options): string {
  return categoryLabel(rubro, options);
}

export function sameCategory(one: unknown, other: unknown): boolean {
  const first = sanitizeCategory(one);
  const second = sanitizeCategory(other);
  if (first.opcion !== second.opcion) return false;
  if (!first.opcion) return true;
  return (
    first.importe === second.importe &&
    (first.importe2 || first.importe) === (second.importe2 || second.importe)
  );
}

/**
 * Inside there is a main cap and a second one, and what each is depends on the category. Outside
 * they are always fuel and grocery: this one and the next translate both ways.
 */
export function capsOf(category: unknown, options: Options): NamedCaps {
  const { importe, importe2 } = sanitizeCategory(category);
  const kind = kindOfCategory(category, options);
  if (kind === "combustible") return { fuel: importe, grocery: "" };
  if (kind === "supermercado") return { fuel: "", grocery: importe };
  if (kind === "ambos") return { fuel: importe2 || importe, grocery: importe };
  return { fuel: importe2, grocery: importe };
}

export function storedCaps(
  kind: CategoryKind,
  fuel: unknown,
  grocery: unknown,
): Pick<CompanyCategory, "importe" | "importe2"> {
  const fuelDigits = digitsOf(fuel);
  const groceryDigits = digitsOf(grocery);
  if (kind === "combustible") return { importe: fuelDigits || groceryDigits, importe2: "" };
  if (kind === "supermercado") return { importe: groceryDigits || fuelDigits, importe2: "" };
  const main = groceryDigits || fuelDigits;
  return { importe: main, importe2: fuelDigits && fuelDigits !== main ? fuelDigits : "" };
}

/** Fuel only, grocery only, or both with Ambos or a category that is not recognized. */
export function enabledCaps(category: CompanyCategory, options: Options) {
  if (!category.opcion) return { fuel: false, grocery: false };
  const kind = kindOfCategory(category, options);
  return { fuel: kind !== "supermercado", grocery: kind !== "combustible" };
}

/** How a cap is written in a field: the amount without its sign. */
export function capText(digits: string): string {
  return formatAmount(digits).slice(1);
}
