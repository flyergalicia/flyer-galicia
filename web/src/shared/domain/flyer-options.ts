// The flyers an administrator publishes ("opciones"): what `_opciones.json` keeps, read tolerantly.
// Which of them a person sees comes from the permissions: see `optionsOfTab`.

/** The tabs of the header that open the flyer editor. Option 1 always lives in the first one. */
export const FLYER_TABS = ["flyer", "rubros", "sueldo"] as const;
export type FlyerTab = (typeof FLYER_TABS)[number];

const CATEGORIES = ["combustible", "supermercado", "ambos", "ninguno"] as const;
export type FlyerCategory = (typeof CATEGORIES)[number];

const MAX_NAME_LENGTH = 40;
const NO_POSITION = 1e6;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ANGLE_BRACKETS = /[<>]/g;

export interface FlyerOption {
  readonly n: number;
  readonly nombre: string;
  readonly color: string;
  readonly solapa: FlyerTab;
  readonly orden: number;
  /** The option this one succeeds; 0 when there is none. */
  readonly reemplaza: number;
  /** Empty: it is deduced from the name by whoever needs it. */
  readonly rubro: FlyerCategory | "";
  /** The option this one is the version without cashback of. */
  readonly sinCB?: number;
}

const DEFAULT_OPTIONS: readonly unknown[] = [
  { n: 1, nombre: "Opción 1" },
  { n: 2, nombre: "Opción 2" },
  { n: 3, nombre: "Opción 3" },
];

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  return number >= 1 ? number : null;
}

function isFlyerTab(value: unknown): value is FlyerTab {
  return FLYER_TABS.some((tab) => tab === value);
}

function isCategory(value: unknown): value is FlyerCategory {
  return CATEGORIES.some((category) => category === value);
}

function otherOption(value: unknown, own: number): number {
  const number = positiveInteger(value);
  return number !== null && number !== own ? number : 0;
}

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined;
}

function nameOf(row: unknown, n: number): string {
  const name = field(row, "nombre");
  const clean = typeof name === "string" ? name.replace(ANGLE_BRACKETS, "").trim() : "";
  return clean.slice(0, MAX_NAME_LENGTH) || `Opción ${String(n)}`;
}

function colorOf(row: unknown): string {
  const color = field(row, "color");
  return typeof color === "string" && HEX_COLOR.test(color) ? color.toLowerCase() : "";
}

function tabOf(row: unknown, n: number): FlyerTab {
  const tab = field(row, "solapa");
  return n !== 1 && isFlyerTab(tab) ? tab : "flyer";
}

function positionOf(row: unknown, n: number): number {
  const position = field(row, "orden");
  return typeof position === "number" && Number.isFinite(position) ? position : NO_POSITION + n;
}

function categoryOf(row: unknown): FlyerCategory | "" {
  const category = field(row, "rubro");
  return isCategory(category) ? category : "";
}

function readOption(row: unknown, n: number): FlyerOption {
  const withoutCashback = otherOption(field(row, "sinCB"), n);
  return {
    n,
    nombre: nameOf(row, n),
    color: colorOf(row),
    solapa: tabOf(row, n),
    orden: positionOf(row, n),
    reemplaza: otherOption(field(row, "reemplaza"), n),
    rubro: categoryOf(row),
    ...(withoutCashback ? { sinCB: withoutCashback } : {}),
  };
}

/** A deleted option cannot be succeeded anymore: the chain would point at nothing. */
function withoutDanglingLinks(option: FlyerOption, known: ReadonlySet<number>): FlyerOption {
  const { sinCB, reemplaza, ...rest } = option;
  return {
    ...rest,
    reemplaza: known.has(reemplaza) ? reemplaza : 0,
    ...(sinCB !== undefined && known.has(sinCB) ? { sinCB } : {}),
  };
}

function firstOption(): FlyerOption {
  return readOption({ n: 1, orden: -1 }, 1);
}

function inPosition(option: FlyerOption, orden: number): FlyerOption {
  return { ...option, orden };
}

/** Whole numbers from 1 on, without repeats, in the saved order, and always with option 1. */
export function sanitizeFlyerOptions(list: unknown): readonly FlyerOption[] {
  const rows: readonly unknown[] = Array.isArray(list) && list.length > 0 ? list : DEFAULT_OPTIONS;
  const byNumber = new Map<number, FlyerOption>();
  for (const row of rows) {
    const n = positiveInteger(field(row, "n"));
    if (n !== null && !byNumber.has(n)) byNumber.set(n, readOption(row, n));
  }
  const known = new Set(byNumber.keys());
  const options = [...byNumber.values()].map((option) => withoutDanglingLinks(option, known));
  if (!known.has(1)) options.unshift(firstOption());
  return options
    .toSorted((one, other) => one.orden - other.orden || one.n - other.n)
    .map((option, index) => inPosition(option, index));
}

/** `_opciones.json` keeps the list under `opts`. */
export function flyerOptionsInFile(file: unknown): readonly FlyerOption[] {
  return sanitizeFlyerOptions(field(file, "opts"));
}

export function optionsOfTab(options: readonly FlyerOption[], tab: FlyerTab): readonly number[] {
  return options.filter((option) => option.solapa === tab).map((option) => option.n);
}

export function isFlyerTabId(id: string): id is FlyerTab {
  return isFlyerTab(id);
}

/** An option that does not exist is option 1, which always does. */
export function optionNumber(options: readonly FlyerOption[], value: unknown): number {
  const number = Number(value);
  return options.some(({ n }) => n === number) ? number : 1;
}

export function optionLabel(options: readonly FlyerOption[], value: unknown): string {
  const number = optionNumber(options, value);
  return options.find(({ n }) => n === number)?.nombre ?? `Opción ${String(number)}`;
}

export function optionTab(options: readonly FlyerOption[], value: unknown): FlyerTab {
  const number = optionNumber(options, value);
  return options.find(({ n }) => n === number)?.solapa ?? "flyer";
}

/**
 * The flyer in force of an option: each campaign is a new option that says which one it replaces,
 * and the companies keep the number of an old one. Going around in circles stops on the way.
 */
export function currentOption(options: readonly FlyerOption[], value: unknown): number {
  let number = Number.parseInt(String(value), 10) || 0;
  const seen = new Set<number>();
  while (number && !seen.has(number)) {
    seen.add(number);
    const next = options.find(({ reemplaza, n }) => reemplaza === number && !seen.has(n));
    if (!next) break;
    number = next.n;
  }
  return number;
}

/** Among several, the one no other of the list replaces and, of those, the highest number. */
export function currentAmong(
  options: readonly FlyerOption[],
  candidates: readonly number[],
): number {
  const replaces = (other: number) =>
    optionNumber(options, options.find(({ n }) => n === other)?.reemplaza);
  const alive = candidates.filter(
    (candidate) =>
      !candidates.some((other) => other !== candidate && replaces(other) === candidate),
  );
  const pool = alive.length > 0 ? alive : candidates;
  return pool.length > 0 ? Math.max(...pool) : 0;
}
