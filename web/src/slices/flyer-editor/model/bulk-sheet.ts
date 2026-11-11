// The sheet of Masivo, as it is read. The headers are recognized even if they come written otherwise
// ("EMPRESA", "Asesor 1 Nombre", "Cashback"), and every row knows the number the person sees in their
// Excel. All of it is text: a phone is never read as a number.
import {
  asText,
  columnKey,
  COMPANY_COLUMNS,
  isCompanyColumn,
  isOfficerColumn,
  isTaxIdColumn,
  marksNoCashback,
  parseCashback,
} from "@/shared/domain/company-registry/index.ts";
import { formatAmount } from "@/shared/flyer-engine/index.ts";
import type { RichText } from "@/shared/domain/rich-text.ts";
import type { ReadSheetRow, SheetToWrite } from "@/shared/lib/sheet-library.ts";

/** "tipo" does not count here: in a sheet of clients it usually is something else. */
const CASHBACK_COLUMNS = ["config", "configuracion", "cashback", "tipocashback", "tipodecashback"];
const FIRST_OFFICER: Readonly<Record<"nombre" | "celular" | "email", readonly string[]>> = {
  nombre: ["nombre", "asesornombre"],
  celular: ["celular", "asesorcelular", "cel"],
  email: ["email", "mail", "asesoremail"],
};
const SIGN_COLUMN = /^(importe|tope|beneficio|segundo)/;
const SECOND_CAP_COLUMN = /^(importe2|tope2|importecombustible|topecombustible|segundo)/;
const FIRST_CAP_COLUMN = /^(importe|tope)/;
const BENEFIT_COLUMN = /^beneficio/;
const OFFICERS = [1, 2, 3, 4] as const;
const ROWS_LISTED = 5;
const BAD_CASHBACK_LISTED = 4;
const FEW_ROWS_NAMED = 4;
const COLUMNS_NAMED = 6;
const PREVIEW_ROWS = 5;
const TEMPLATE_HEAD_WIDTHS = [22, 16, 38];

export interface BulkOfficer {
  readonly nombre: string;
  readonly celular: string;
  readonly email: string;
}

/** A line of the sheet, read: what its columns say, whatever they are called. */
export interface BulkRow {
  /** The columns as they come, without the blanks around them. */
  readonly cells: Readonly<Record<string, string>>;
  /** The number it has in the sheet of the person; null if the reader did not say. */
  readonly sheetRow: number | null;
  readonly empresa: string;
  readonly config: string;
  readonly officers: readonly BulkOfficer[];
  readonly benefit: {
    readonly beneficio: string;
    readonly importe: string;
    readonly importe2: string;
  };
}

export interface BulkReport {
  readonly severity: "error" | "warning" | "ok";
  /** One line each. */
  readonly lines: readonly RichText[];
  readonly canGenerate: boolean;
  readonly countText: string;
  readonly columns: readonly string[];
  readonly preview: readonly (readonly string[])[];
  readonly notShown: number;
}

function cellsByKey(cells: Readonly<Record<string, string>>): Map<string, string> {
  return new Map(Object.entries(cells).map(([key, value]) => [columnKey(key), value]));
}

function firstOf(cells: ReadonlyMap<string, string>, columns: readonly string[]): string {
  for (const column of columns) {
    const value = cells.get(column);
    if (value) return value;
  }
  return "";
}

function officerOf(cells: ReadonlyMap<string, string>, number: number): BulkOfficer {
  const field = (name: keyof typeof FIRST_OFFICER) =>
    cells.get(`asesor${String(number)}${name}`) ||
    (number === 1 ? firstOf(cells, FIRST_OFFICER[name]) : "");
  return { nombre: field("nombre"), celular: field("celular"), email: field("email") };
}

function benefitOf(cells: ReadonlyMap<string, string>): BulkRow["benefit"] {
  const found = { beneficio: "", importe: "", importe2: "" };
  for (const [key, value] of cells) {
    if (!value) continue;
    if (SECOND_CAP_COLUMN.test(key)) found.importe2 ||= value;
    else if (FIRST_CAP_COLUMN.test(key)) found.importe ||= value;
    else if (BENEFIT_COLUMN.test(key)) found.beneficio ||= value;
  }
  return found;
}

function bulkRowOf(cells: Readonly<Record<string, string>>, sheetRow: number | null): BulkRow {
  const keyed = cellsByKey(cells);
  return {
    cells,
    sheetRow,
    empresa: firstOf(keyed, COMPANY_COLUMNS),
    config: firstOf(keyed, CASHBACK_COLUMNS),
    officers: OFFICERS.map((number) => officerOf(keyed, number)),
    benefit: benefitOf(keyed),
  };
}

/** Numbers and dates as they read, and the rows with nothing in them are not rows. */
export function readBulkRows(rows: readonly ReadSheetRow[]): readonly BulkRow[] {
  return rows.flatMap((row) => {
    const cells = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, asText(value).trim()]),
    );
    if (!Object.values(cells).some(Boolean)) return [];
    const position: unknown = Reflect.get(row, "__rowNum__");
    return [bulkRowOf(cells, typeof position === "number" ? position + 1 : null)];
  });
}

/** The number to name a row by: the one of its sheet. */
export function rowNumber(row: BulkRow, position: number): number {
  return row.sheetRow ?? position + 2;
}

function isKnownColumn(key: string): boolean {
  return (
    isOfficerColumn(key) ||
    isCompanyColumn(key) ||
    CASHBACK_COLUMNS.includes(key) ||
    SIGN_COLUMN.test(key) ||
    isTaxIdColumn(key)
  );
}

/** "5, 9 y 3 más". */
function listed(numbers: readonly (number | string)[], most = ROWS_LISTED): string {
  const shown = numbers.slice(0, most).join(", ");
  return numbers.length > most ? `${shown} y ${String(numbers.length - most)} más` : shown;
}

interface RowFindings {
  readonly noCompany: readonly number[];
  readonly noCashback: readonly number[];
  readonly badCashback: readonly string[];
  readonly badMail: readonly number[];
  readonly noCap: readonly number[];
}

interface Columns {
  readonly hasCompany: boolean;
  readonly hasCashback: boolean;
  readonly hasOfficers: boolean;
  readonly unknown: readonly string[];
}

function columnsOf(rows: readonly BulkRow[]): Columns {
  const written = new Map<string, string>();
  for (const { cells } of rows) {
    for (const column of Object.keys(cells)) written.set(columnKey(column), column);
  }
  const keys = [...written.keys()];
  return {
    hasCompany: keys.some(isCompanyColumn),
    hasCashback: keys.some((key) => CASHBACK_COLUMNS.includes(key)),
    hasOfficers: keys.some(isOfficerColumn),
    unknown: [...written].flatMap(([key, column]) => (isKnownColumn(key) ? [] : [column])),
  };
}

function findingsOf(
  rows: readonly BulkRow[],
  { hasCompany, hasCashback }: Columns,
  names: readonly string[],
  isCategoryTab: boolean,
): RowFindings {
  const findings = {
    noCompany: [] as number[],
    noCashback: [] as number[],
    badCashback: [] as string[],
    badMail: [] as number[],
    noCap: [] as number[],
  };
  rows.forEach((row, position) => {
    const number = rowNumber(row, position);
    if (hasCompany && !row.empresa) findings.noCompany.push(number);
    const cashback = row.config.toLowerCase().trim();
    if (hasCashback && (!cashback || marksNoCashback(cashback))) findings.noCashback.push(number);
    else if (hasCashback && parseCashback(cashback, names) < 0) {
      findings.badCashback.push(`fila ${String(number)} ("${cashback}")`);
    }
    if (row.officers.some(({ email }) => email && !email.includes("@"))) {
      findings.badMail.push(number);
    }
    if (isCategoryTab && !formatAmount(row.benefit.importe)) findings.noCap.push(number);
  });
  return findings;
}

function errorsOf({ hasCompany }: Columns, { noCompany }: RowFindings): readonly RichText[] {
  const errors: RichText[] = [];
  if (!hasCompany) {
    errors.push([
      "No encontré la columna ",
      { strong: "empresa" },
      ". Renombrá esa columna a «empresa» (como en la plantilla).",
    ]);
  }
  if (noCompany.length > 0) errors.push([`Fila ${listed(noCompany)}: empresa vacía`]);
  return errors;
}

function missingColumnWarnings({ hasCashback, hasOfficers }: Columns): readonly RichText[] {
  const warnings: RichText[] = [];
  if (!hasCashback) {
    warnings.push([
      "No encontré la columna del cashback (",
      { strong: "config" },
      "): ",
      { strong: "todos" },
      " los flyers van a salir ",
      { strong: "sin montos" },
      ". Si tienen cashback, llamá a esa columna «config» (como en la plantilla).",
    ]);
  }
  if (!hasOfficers) {
    warnings.push([
      "No encontré columnas de oficiales (",
      { strong: "asesor1_nombre" },
      ", asesor1_celular…): los flyers salen ",
      { strong: "sin datos de contacto" },
      ".",
    ]);
  }
  return warnings;
}

function noCashbackWarning(rowsWithout: readonly number[], total: number): string {
  const count = rowsWithout.length;
  const who = count === total ? "todos los flyers" : "esos flyers";
  const which = count <= FEW_ROWS_NAMED ? ` (fila ${rowsWithout.join(", ")})` : "";
  return `${String(count)} fila${count > 1 ? "s" : ""} sin cashback (celda vacía o SIN): ${who} salen sin montos${which}.`;
}

function rowWarnings(findings: RowFindings, total: number): readonly RichText[] {
  const { badCashback, noCashback, badMail, noCap } = findings;
  const warnings: RichText[] = [];
  if (badCashback.length > 0) {
    warnings.push([
      `Cashback que no reconozco (${String(badCashback.length)}): ${listed(badCashback, BAD_CASHBACK_LISTED)} → esos flyers salen sin cashback.`,
    ]);
  }
  if (noCashback.length > 0) warnings.push([noCashbackWarning(noCashback, total)]);
  if (badMail.length > 0) warnings.push([`Fila ${listed(badMail)}: email sin @`]);
  if (noCap.length > 0) {
    warnings.push([`Fila ${listed(noCap)}: sin importe (se usa el tope del formulario)`]);
  }
  return warnings;
}

function ignoredColumnsWarning({ unknown }: Columns): readonly RichText[] {
  if (unknown.length === 0) return [];
  return [
    [
      `Columnas que ignoré: ${listed(unknown, COLUMNS_NAMED)}. Si alguna debería usarse, revisá el nombre contra la plantilla.`,
    ],
  ];
}

function allGoodLine(count: number): RichText {
  return [`Todo OK — ${String(count)} flyer${count > 1 ? "s" : ""}`];
}

/** Says what is wrong in the words of a person. It stops only with an error; a warning goes on. */
export function validateBulkRows(
  rows: readonly BulkRow[],
  { names, isCategoryTab }: { readonly names: readonly string[]; readonly isCategoryTab: boolean },
): BulkReport {
  const columns = columnsOf(rows);
  const findings = findingsOf(rows, columns, names, isCategoryTab);
  const errors = errorsOf(columns, findings);
  const warnings = [
    ...missingColumnWarnings(columns),
    ...rowWarnings(findings, rows.length),
    ...ignoredColumnsWarning(columns),
  ];
  const [first] = rows;
  const keys = first ? Object.keys(first.cells) : [];
  const count = rows.length;
  let severity: BulkReport["severity"] = "ok";
  if (errors.length > 0) severity = "error";
  else if (warnings.length > 0) severity = "warning";
  const lines = { error: errors, warning: warnings, ok: [allGoodLine(count)] };
  return {
    severity,
    lines: lines[severity],
    canGenerate: errors.length === 0,
    countText: `${String(count)} fila${count > 1 ? "s" : ""}`,
    columns: keys,
    preview: rows.slice(0, PREVIEW_ROWS).map(({ cells }) => keys.map((key) => cells[key] ?? "")),
    notShown: Math.max(0, count - PREVIEW_ROWS),
  };
}

export interface TemplateSign {
  readonly isCategoryTab: boolean;
  readonly firstCapLabel: string;
  readonly secondCapLabel: string;
  readonly usesSecondCap: boolean;
}

function officerHead(): readonly string[] {
  return OFFICERS.flatMap((number) =>
    ["nombre", "celular", "email"].map((field) => `asesor${String(number)}_${field}`),
  );
}

/** Generic data, with the four officers. In Rubros, the columns of the sign of this flyer. */
export function bulkTemplate({
  isCategoryTab,
  firstCapLabel,
  secondCapLabel,
  usesSecondCap,
}: TemplateSign): SheetToWrite {
  const head = ["empresa", ...officerHead(), "config"];
  const first = [
    "Empresa Ejemplo S.A.",
    "Nombre Apellido",
    "11 1234 5678",
    "nombre.apellido@bancogalicia.com.ar",
    ...Array.from({ length: 9 }, () => ""),
    "BAU",
  ];
  const second = [
    "Empresa XYZ",
    "Carlos Lopez",
    "11 4444 5555",
    "carlos.lopez@bancogalicia.com.ar",
    "Ana Perez",
    "11 5555 6666",
    "ana.perez@bancogalicia.com.ar",
    ...Array.from({ length: 6 }, () => ""),
    "Config 1",
  ];
  const widths = [22, ...OFFICERS.flatMap(() => TEMPLATE_HEAD_WIDTHS), 10];
  if (!isCategoryTab) {
    return {
      lines: [head, first, second],
      widths,
      sheetName: "Flyers",
      fileName: "Plantilla_Flyers_Galicia.xlsx",
    };
  }
  const secondColumns = usesSecondCap ? [`importe2 (${secondCapLabel})`] : [];
  return {
    lines: [
      [
        ...head,
        "beneficio",
        `importe${usesSecondCap ? ` (${firstCapLabel})` : ""}`,
        ...secondColumns,
      ],
      [...first, "EMPRESA EJEMPLO", "24.000", ...(usesSecondCap ? ["30.000"] : [])],
      [...second, "-", "24.000", ...(usesSecondCap ? [""] : [])],
    ],
    widths: [...widths, 22, usesSecondCap ? 28 : 12, ...(usesSecondCap ? [34] : [])],
    sheetName: "Flyers",
    fileName: "Plantilla_Flyers_Rubros.xlsx",
  };
}
