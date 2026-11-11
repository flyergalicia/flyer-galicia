// The names an administrator gives to the tabs and the panels, and the order of the tabs of the
// header: what `_titulos.json` keeps. Without anything saved, the ones of the app.

const MAX_TITLE_LENGTH = 40;
const MAX_ORDER_LENGTH = 12;
const TAB_ID = /^[a-z0-9_-]{1,20}$/i;
const ANGLE_BRACKETS = /[<>]/g;

export const DEFAULT_TITLES = {
  ptitle: "Flyer Galicia 5.5",
  promos: "Promociones",
  estudio: "Estudio",
  promos_ptitle: "Buscador de Promociones",
  hunter: "Buscar flyer",
  hunter_ptitle: "Flyer por empresa",
  flyer: "Flyer Galicia",
  rubros: "Flyer Rubros",
  sueldo: "Flyer Sueldo",
} as const;

export type TitleKey = keyof typeof DEFAULT_TITLES;

export interface ScreenTitles {
  readonly names: Readonly<Partial<Record<TitleKey, string>>>;
  /** The ids of the tabs, in the order the administrator left them; null if never moved. */
  readonly order: readonly string[] | null;
}

export const NO_TITLES: ScreenTitles = { names: {}, order: null };

const TITLE_KEYS: readonly TitleKey[] = [
  "ptitle",
  "promos",
  "estudio",
  "promos_ptitle",
  "hunter",
  "hunter_ptitle",
  "flyer",
  "rubros",
  "sueldo",
];

export function cleanTitle(text: string): string {
  return text.replace(ANGLE_BRACKETS, "").trim().slice(0, MAX_TITLE_LENGTH);
}

function readNames(file: object): ScreenTitles["names"] {
  const names: Partial<Record<TitleKey, string>> = {};
  for (const key of TITLE_KEYS) {
    const name: unknown = Reflect.get(file, key);
    if (typeof name === "string") names[key] = cleanTitle(name);
  }
  return names;
}

function readOrder(file: object): readonly string[] | null {
  const order: unknown = Reflect.get(file, "orden");
  if (!Array.isArray(order)) return null;
  const ids: readonly unknown[] = order;
  return ids
    .filter((id): id is string => typeof id === "string" && TAB_ID.test(id))
    .slice(0, MAX_ORDER_LENGTH);
}

export function readScreenTitles(file: unknown): ScreenTitles {
  if (typeof file !== "object" || file === null) return NO_TITLES;
  return { names: readNames(file), order: readOrder(file) };
}

export function titleOf(titles: ScreenTitles, key: TitleKey): string {
  return titles.names[key]?.trim() || DEFAULT_TITLES[key];
}

/** A tab that is not on the saved list came later: it goes last, in the order it has by default. */
export function orderTabs(ids: readonly string[], order: readonly string[] | null): string[] {
  if (!order || order.length === 0) return [...ids];
  const rank = (id: string): number => {
    const saved = order.indexOf(id);
    return saved === -1 ? order.length + ids.indexOf(id) : saved;
  };
  return ids.toSorted((one, other) => rank(one) - rank(other));
}

/** What goes in the file: every name there is, and the order if it was ever moved. */
export function screenTitlesFile({ names, order }: ScreenTitles, now: Date): string {
  return JSON.stringify({
    ...names,
    ...(order ? { orden: order } : {}),
    updated_at: now.toISOString(),
  });
}
