// A batch of Masivo: which flyer each line goes on, what its flyer says and what is told afterwards.
import {
  type CashbackConfig,
  cashbackIndex,
  type DestinationRules,
  destinationLabel,
  versionWithoutCashback,
} from "@/shared/domain/company-registry/index.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import {
  type BatchProblem,
  formatAmount,
  type FlyerScene,
  type FlyerValues,
  hasNoAmounts,
} from "@/shared/flyer-engine/index.ts";
import { baseOption } from "./category-check.ts";
import { type BulkRow, rowNumber } from "./bulk-sheet.ts";

const OFFICER_SLOTS = [
  [1, ""],
  [2, "2"],
  [3, "3"],
  [4, "4"],
] as const;
const ERRORS_TOLD = 3;
const NAMES_IN_SUMMARY = 12;

/** A line in the batch: the number of its sheet stays with it, whatever the order. */
export interface PlannedRow {
  readonly row: BulkRow;
  readonly number: number;
  readonly option: number;
}

export interface BulkPlan {
  /** The ones of the flyer on screen go first, and then the ones of the other one. */
  readonly rows: readonly PlannedRow[];
}

/**
 * With a version without cashback, each line goes on the one it needs, from whichever one it started.
 * Not in a draft or with a crop: there, what is being built decides, and everything goes on it.
 */
export function bulkPlan(
  rows: readonly BulkRow[],
  origin: number,
  isFree: boolean,
  rules: DestinationRules,
): BulkPlan {
  const base = baseOption(origin, rules.options);
  const withoutCashback = isFree ? versionWithoutCashback(base, rules) || origin : origin;
  const withCashback = isFree && origin !== base && rules.can(`opcion_${base}`) ? base : origin;
  const planned = rows.map((row, position) => ({
    row,
    number: rowNumber(row, position),
    option: cashbackIndex(row.config, rules.cashbackNames) < 0 ? withoutCashback : withCashback,
  }));
  return {
    rows: [
      ...planned.filter(({ option }) => option === origin),
      ...planned.filter(({ option }) => option !== origin),
    ],
  };
}

export interface BulkFlyerContext {
  readonly configs: readonly CashbackConfig[];
  readonly names: readonly string[];
  readonly legal: string;
  readonly singleCashback: boolean;
  readonly hasBenefit: boolean;
  readonly formCap: string;
  readonly formSecondCap: string;
}

function benefitValues({ benefit, empresa }: BulkRow, formCap: string, formSecondCap: string) {
  const importe = formatAmount(benefit.importe) || formCap;
  return {
    benef: true,
    // "-": no name on the sign, "¡Beneficio exclusivo!".
    benefNombre: benefit.beneficio === "-" ? "" : benefit.beneficio || empresa,
    importe,
    importe2: formatAmount(benefit.importe2) || formSecondCap || importe,
  };
}

/** Without a cashback it understands, that flyer comes out without amounts. */
export function bulkFlyerValues(row: BulkRow, context: BulkFlyerContext): FlyerValues {
  const { configs, names, legal, singleCashback, hasBenefit, formCap, formSecondCap } = context;
  const index = cashbackIndex(row.config, names);
  const { m1, m2, m3, m4 } = configs[index < 0 ? 0 : index] ?? {};
  const values: FlyerValues = {
    empresa: row.empresa,
    nocb: index < 0,
    m1: m1 ?? null,
    m2: m2 ?? null,
    m3: m3 ?? null,
    m4: m4 ?? null,
    legal,
    cashUnico: singleCashback,
    ...(hasBenefit ? benefitValues(row, formCap, formSecondCap) : {}),
  };
  for (const [number, suffix] of OFFICER_SLOTS) {
    const { nombre = "", celular = "", email = "" } = row.officers[number - 1] ?? {};
    values[`has${number}`] = nombre !== "";
    values[`nombre${suffix}`] = nombre;
    values[`celular${suffix}`] = celular ? `Cel: ${celular}` : "";
    values[`email${suffix}`] = email;
  }
  return values;
}

export interface BulkError {
  readonly number: number;
  readonly company: string;
  readonly reason: string;
}

/** What did not come out, in the words of a person: the row of the sheet and why. */
export function bulkErrors(
  problems: readonly BatchProblem<PlannedRow>[],
  labelOf: (option: number) => string,
): readonly BulkError[] {
  return problems.map(({ row: { row, number }, option, reason, detail }) => ({
    number,
    company: row.empresa || `(fila ${String(number)})`,
    reason:
      reason === "drawing"
        ? `no se pudo dibujar (${detail ?? ""})`
        : `no se pudo cargar el flyer «${labelOf(option)}»`,
  }));
}

/** Each flyer it tried to draw: nothing on the screen says it, and a test reads it. */
export interface DrawnLine {
  readonly company: string;
  readonly officer: string;
  readonly phone: string;
  readonly firstAmount: string;
  readonly noCashback: boolean;
  readonly option: number;
  readonly hasAmounts: boolean;
}

export function drawnLine(values: FlyerValues, option: number, scene: FlyerScene): DrawnLine {
  return {
    company: values.empresa,
    officer: values.nombre ?? "",
    phone: values.celular ?? "",
    firstAmount: String(values.m1 ?? ""),
    noCashback: Boolean(values.nocb),
    option,
    hasAmounts: !hasNoAmounts(scene),
  };
}

export interface BulkSummary {
  readonly total: number;
  readonly generated: number;
  readonly date: Date;
  readonly perOption: ReadonlyMap<number, number>;
  readonly noCashback: readonly string[];
  readonly noOfficers: readonly string[];
  readonly errors: readonly BulkError[];
}

type LabelRules = Pick<DestinationRules, "options" | "tabLabel">;

function namesText(names: readonly string[]): string {
  const shown = names.slice(0, NAMES_IN_SUMMARY).join(", ");
  return names.length > NAMES_IN_SUMMARY
    ? `${shown} y ${String(names.length - NAMES_IN_SUMMARY)} más`
    : shown;
}

/** Resumen.txt: the words are read by people, and they are the ones it always had. */
export function bulkSummaryText(summary: BulkSummary, rules: LabelRules): string {
  const { total, generated, date, perOption, noCashback, noOfficers, errors } = summary;
  const observations = [
    { text: "sin cashback (importes en blanco)", names: noCashback },
    { text: "sin oficiales (salen sin datos de contacto)", names: noOfficers },
  ]
    .filter(({ names }) => names.length > 0)
    .map(({ text, names }) => `  ${String(names.length)} ${text}: ${namesText(names)}`);
  const failures = errors.map(
    ({ number, company, reason }) => `  Fila ${String(number)} — ${company}: ${reason}`,
  );
  return [
    "FLYERS GENERADOS DESDE EL EXCEL (MASIVO)",
    `Fecha: ${relativeDate(date.toISOString())}`,
    `Filas del Excel: ${String(total)}`,
    `Flyers generados: ${String(generated)}`,
    `No se generaron: ${String(errors.length)}`,
    "",
    "POR FORMATO",
    // By number: the order the summary always had.
    ...[...perOption]
      .toSorted(([first], [second]) => first - second)
      .map(([option, count]) => `  ${destinationLabel(option, rules)}: ${String(count)}`),
    "",
    "OBSERVACIONES",
    ...(observations.length > 0 ? observations : ["  Ninguna."]),
    "",
    "FILAS QUE NO SE GENERARON",
    ...(failures.length > 0 ? failures : ["  Ninguna."]),
  ].join("\n");
}

function errorsTold(errors: readonly BulkError[]): string {
  const told = errors
    .slice(0, ERRORS_TOLD)
    .map(({ number, company, reason }) => `fila ${String(number)} (${company}): ${reason}`)
    .join(" · ");
  return `${told}${errors.length > ERRORS_TOLD ? " …" : ""}`;
}

export function nothingCameOutText(errors: readonly BulkError[]): string {
  return `No se generó ningún flyer — ${errorsTold(errors)}`;
}

export function zipDoneText(generated: number, errors: readonly BulkError[]): string {
  const flyers = `✓ ZIP con ${String(generated)} flyer${generated === 1 ? "" : "s"}`;
  if (errors.length === 0) return `${flyers}!`;
  const howMany = errors.length === 1 ? "1 no salió: " : `${String(errors.length)} no salieron: `;
  return `${flyers} — ${howMany}${errorsTold(errors)} (el detalle está en Resumen.txt, dentro del ZIP)`;
}

export function zipDoneNotice(errors: readonly BulkError[]): string {
  return errors.length > 0
    ? `ZIP descargado: ${String(errors.length)} fila(s) no se pudieron generar`
    : "ZIP descargado!";
}
