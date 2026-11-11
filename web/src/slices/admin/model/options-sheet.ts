// Config → Opciones: a copy of the list of flyers that is edited and, only on saving, goes to
// everybody. As today, the copy is the one of the flyer bar (`_opcListaActual`): it has not what each
// option replaces, its category or its version without cashback, so each row shows none and saving
// takes them out of every row not touched. An error of the old version, ported as it is: it is
// a decision of the owner (see etapa4-avance).
import {
  activeOptionOfKind,
  type CategoryKind,
  kindOfOption,
  kindOfText,
} from "@/shared/domain/company-registry/categories.ts";
import {
  FLYER_TABS,
  type FlyerCategory,
  type FlyerOption,
  optionColor,
} from "@/shared/domain/flyer-options.ts";
import type { ListEntry } from "@/shared/lib/app-config/flyer-list-store.ts";

export type OptionDraft = ListEntry & {
  readonly reemplaza: number;
  readonly rubro: FlyerCategory | "";
};

export type DraftField = "nombre" | "color" | "solapa" | "rubro" | "reemplaza";

export const OPTION_NAME_LENGTH = 40;
export const FIRST_OPTION = 1;

export const CATEGORY_CHOICES: readonly (readonly [FlyerCategory, string])[] = [
  ["combustible", "Combustible"],
  ["supermercado", "Supermercado"],
  ["ambos", "Súper y combustible"],
  ["ninguno", "Ninguno (no entra en el ruteo)"],
];

const CATEGORY_NAMES: Readonly<Record<Exclude<CategoryKind, "">, string>> = {
  combustible: "Combustible",
  supermercado: "Supermercado",
  ambos: "Súper y combustible",
};

const OPTION_COLORS: readonly string[] = [
  "#1d4070",
  "#0e8a5f",
  "#8e44ad",
  "#b26a00",
  "#c2185b",
  "#00838f",
  "#5d4037",
  "#455a64",
];

/** The list as the flyer bar has it, each one with its color filled in, in its order. */
export function draftsOf(options: readonly FlyerOption[]): readonly OptionDraft[] {
  return options.map((option, orden) => ({
    n: option.n,
    nombre: option.nombre,
    color: optionColor(options, option.n),
    solapa: option.solapa,
    orden,
    reemplaza: 0,
    rubro: "",
  }));
}

function changedDraft(draft: OptionDraft, field: DraftField, value: string): OptionDraft {
  if (field === "reemplaza") return { ...draft, reemplaza: Number.parseInt(value, 10) || 0 };
  if (field === "rubro") {
    const rubro = CATEGORY_CHOICES.find(([category]) => category === value)?.[0] ?? "";
    return { ...draft, rubro };
  }
  // On another tab, the ones it could replace are others.
  if (field === "solapa") {
    const solapa = FLYER_TABS.find((tab) => tab === value) ?? draft.solapa;
    return { ...draft, solapa, reemplaza: 0 };
  }
  return { ...draft, [field]: value };
}

export function withDraftField(
  drafts: readonly OptionDraft[],
  index: number,
  field: DraftField,
  value: string,
): readonly OptionDraft[] {
  return drafts.map((draft, at) => (at === index ? changedDraft(draft, field, value) : draft));
}

/** The next number, with its color, in the tab of always. */
export function withNewOption(drafts: readonly OptionDraft[]): readonly OptionDraft[] {
  const n = Math.max(0, ...drafts.map((draft) => draft.n)) + 1;
  const added: OptionDraft = {
    n,
    nombre: `Opción ${String(n)}`,
    color: OPTION_COLORS[(n - 1) % OPTION_COLORS.length] ?? "",
    solapa: "flyer",
    orden: drafts.length,
    reemplaza: 0,
    rubro: "",
  };
  return [...drafts, added];
}

export function withoutOption(
  drafts: readonly OptionDraft[],
  index: number,
): readonly OptionDraft[] {
  return drafts[index]?.n === FIRST_OPTION ? drafts : drafts.filter((_draft, at) => at !== index);
}

/** What the list keeps: the position on the page is its order. */
export function listToSave(drafts: readonly OptionDraft[]): readonly ListEntry[] {
  return drafts.map((draft, orden) => ({ ...draft, orden }));
}

/** "Reemplaza a": only another one of the same tab. */
export function replaceableBy(
  drafts: readonly OptionDraft[],
  draft: OptionDraft,
): readonly OptionDraft[] {
  return drafts.filter((other) => other.n !== draft.n && other.solapa === draft.solapa);
}

/** "Rubro: según el nombre (Combustible)", or "(no lo dice)". */
export function categoryByNameLabel(name: string): string {
  const kind = kindOfText(name);
  return `Rubro: según el nombre${kind ? ` (${CATEGORY_NAMES[kind]})` : " (no lo dice)"}`;
}

/**
 * The flyer that gets today the companies of its category: of what is saved, not of what is being
 * edited (it is what the editor follows).
 */
export function isCurrentOfCategory(draft: OptionDraft, saved: readonly FlyerOption[]): boolean {
  if (draft.solapa !== "rubros" || !saved.some(({ n }) => n === draft.n)) return false;
  const kind = kindOfOption(draft.n, saved);
  return Boolean(kind) && activeOptionOfKind(kind, saved) === draft.n;
}

/** What each one has active: the name of its file, empty with none, undefined while unknown. */
export type ActiveNames = ReadonlyMap<number, string>;

/** Unknown (it could not be read) says nothing: it is never "sin flyer" (invariant 24). */
export function activeText(active: ActiveNames | undefined, option: number): string {
  if (!active) return "";
  const name = active.get(option) ?? "";
  return name
    ? `Flyer activo: ${name}`
    : "Sin flyer activo todavía (se sube desde Config → Flyer).";
}

/** What `_active<n>.json` says of a flyer: the name of its file, or that it has none. */
export function activeNameOf(
  active: { readonly name: string; readonly imageUrl: string | null } | null | undefined,
): string {
  return active?.imageUrl ? active.name || "flyer activo" : "";
}

export function removeOptionQuestion(
  draft: OptionDraft,
  activeName: string,
): { readonly title: string; readonly body: string } {
  const warning = activeName ? `\nOjo: hoy tiene un flyer activo (${activeName}).` : "";
  return {
    title: `¿Quitar "${draft.nombre}"?`,
    body: `Deja de verse para todos los perfiles. Su flyer y su legal quedan guardados por si la volvés a agregar con el mismo número (${String(draft.n)}).${warning}`,
  };
}

export function savedOptionsText(before: readonly number[], after: readonly FlyerOption[]): string {
  const added = after.some(({ n }) => !before.includes(n));
  return added
    ? "Opciones guardadas. Para que un perfil vea la nueva, habilitala en Admin → Facultades."
    : "Opciones guardadas";
}
