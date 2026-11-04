// The cashback of a company: what the cell says, read with tolerance. Reading it exactly left every
// "Config1" in BAU without saying so (invariant 13): what is not understood is told apart.
import { asText, columnKey } from "./text.ts";

/** The amounts of each configuration, as `_cashback.json` keeps them. */
export interface CashbackConfig {
  readonly nombre: string;
  readonly m1: string;
  readonly m2: string;
  readonly m3: string;
  readonly m4: string;
}

const BASE_CONFIG: CashbackConfig = {
  nombre: "BAU",
  m1: "$250.000",
  m2: "$180.000",
  m3: "$80.000",
  m4: "$30.000",
};

export const DEFAULT_CASHBACK_CONFIGS: readonly CashbackConfig[] = [
  BASE_CONFIG,
  { nombre: "Config 1", m1: "$350.000", m2: "$200.000", m3: "$80.000", m4: "$30.000" },
  { nombre: "Config 2", m1: "$400.000", m2: "$300.000", m3: "$100.000", m4: "$40.000" },
  { nombre: "Config 3", m1: "$500.000", m2: "$320.000", m3: "$100.000", m4: "$40.000" },
  { nombre: "Config 4", m1: "$600.000", m2: "$350.000", m3: "$80.000", m4: "$30.000" },
];

const AMOUNT_KEYS = ["m1", "m2", "m3", "m4"] as const;
const ANGLE_BRACKETS = /[<>]/g;
const MAX_NAME_LENGTH = 30;
const TRAILING_ZEROS = /[.,]0+$/;
const ENDS_IN_NUMBER = /([0-9]+)$/;

/** The ways of saying on purpose that a company has no cashback. */
const NO_CASHBACK = new Set([
  "",
  "sin",
  "sincb",
  "sincashback",
  "nocorresponde",
  "nocorrespondecashback",
  "no",
  "na",
  "ninguno",
  "ninguna",
  "ningun",
  "sc",
  "nada",
  "exento",
  "exenta",
  "excluido",
  "excluida",
  "cero",
]);

export const NO_CASHBACK_INDEX = -1;

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined;
}

function defaultName(position: number): string {
  return position === 0 ? "BAU" : `Config ${String(position)}`;
}

function readConfig(row: unknown, position: number, base: CashbackConfig): CashbackConfig {
  const known = DEFAULT_CASHBACK_CONFIGS[position];
  const start: CashbackConfig = known ?? { ...base, nombre: defaultName(position) };
  if (!row) return start;
  const amounts = Object.fromEntries(
    AMOUNT_KEYS.flatMap((key) => {
      const amount = field(row, key);
      return amount == null ? [] : [[key, asText(amount)]];
    }),
  );
  const name = asText(field(row, "nombre"))
    .replace(ANGLE_BRACKETS, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return { ...start, ...amounts, nombre: name || defaultName(position) };
}

/** `_cashback.json` keeps the list under `configs`. Without one, the ones of always. */
export function cashbackConfigsInFile(file: unknown): readonly CashbackConfig[] {
  const list = field(file, "configs");
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_CASHBACK_CONFIGS;
  const configs: CashbackConfig[] = [];
  for (const [position, row] of list.entries()) {
    configs.push(readConfig(row, position, configs[0] ?? BASE_CONFIG));
  }
  return configs;
}

export function cashbackNames(configs: readonly CashbackConfig[]): readonly string[] {
  return configs.map(({ nombre }) => nombre);
}

/** The position of a configuration; -1 when it is not understood. An empty cell is the first. */
export function parseCashback(raw: unknown, names: readonly string[]): number {
  const clean = asText(raw).trim().replace(TRAILING_ZEROS, "");
  const key = columnKey(clean);
  // "-" leaves no key, but it is not an empty cell: it is a value that is not understood.
  if (!key) return clean ? NO_CASHBACK_INDEX : 0;
  if (key === "bau" || key === "base" || key === "estandar") return 0;
  const number = Number.parseInt(ENDS_IN_NUMBER.exec(key)?.[1] ?? "", 10);
  if (number >= 0 && number < names.length) return number;
  const byName = names.findIndex((name) => columnKey(name) === key);
  return byName >= 0 ? byName : NO_CASHBACK_INDEX;
}

/** What it means for a company: an empty cell is no cashback here. */
export function cashbackIndex(raw: unknown, names: readonly string[]): number {
  const clean = asText(raw).trim();
  return clean ? parseCashback(clean, names) : NO_CASHBACK_INDEX;
}

/** Says apart a company marked on purpose from a value that is not understood. */
export function marksNoCashback(raw: unknown): boolean {
  return NO_CASHBACK.has(columnKey(raw));
}

export function cashbackName(index: number, names: readonly string[]): string {
  if (index < 0) return "Sin cashback";
  return names[index] ?? "BAU";
}

/** What goes in the cell of the sheet: empty is no cashback. */
export function cashbackCell(index: number, names: readonly string[]): string {
  return index < 0 ? "" : cashbackName(index, names);
}
