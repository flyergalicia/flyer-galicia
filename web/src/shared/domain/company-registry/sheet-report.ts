// What is said about a sheet before saving anything: what is strange in it is shown and the person
// decides. Each row keeps the number it has in the Excel of the person.
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import type { RichPart, RichText } from "../rich-text.ts";
import { type Options, categoryOptions } from "./categories.ts";
import { cashbackIndex, marksNoCashback } from "./cashback.ts";
import type { Company } from "./company.ts";
import {
  categoryTextOfRow,
  companyOfSheetRow,
  crossedCap,
  isCashbackColumn,
  isCompanyColumn,
  isKnownColumn,
  type SheetRow,
} from "./sheet.ts";
import { columnKey } from "./text.ts";

const TAX_ID_LENGTH = 11;
const LISTED = 4;
const LISTED_ROWS = 6;
const LISTED_COLUMNS = 6;
/** Where the sheet starts counting, for a reader that does not say the number of the row. */
const FIRST_ROW = 2;

export interface SheetProblem {
  readonly serious: boolean;
  readonly text: RichText;
}

export interface SheetReport {
  readonly rows: readonly Company[];
  readonly problems: readonly SheetProblem[];
  readonly discarded: number;
  readonly serious: number;
}

export interface SheetContext {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
}

interface Finding {
  readonly row: number;
  readonly value: string;
}

interface CrossedFinding {
  readonly row: number;
  readonly kind: "combustible" | "supermercado";
}

interface Findings {
  readonly rows: Company[];
  readonly badCashback: Finding[];
  readonly badTaxIds: Finding[];
  readonly badCategories: Finding[];
  readonly crossed: CrossedFinding[];
  readonly nameless: number[];
  noCashback: number;
  discarded: number;
}

/** The number the person sees: the reader says it, in a property that does not list. */
function rowNumber(row: SheetRow, position: number): number {
  const reported: unknown = Reflect.get(row, "__rowNum__");
  return typeof reported === "number" ? reported + 1 : position + FIRST_ROW;
}

function inspectCashback(company: Company, row: number, found: Findings, names: readonly string[]) {
  if (cashbackIndex(company.config, names) >= 0) return;
  if (marksNoCashback(company.config)) found.noCashback += 1;
  else found.badCashback.push({ row, value: company.config });
}

function inspectRow(sheetRow: SheetRow, position: number, found: Findings, context: SheetContext) {
  const { options, cashbackNames } = context;
  const company = companyOfSheetRow(sheetRow, options);
  if (!company) {
    found.discarded += 1;
    return;
  }
  const row = rowNumber(sheetRow, position);
  const categoryText = categoryTextOfRow(sheetRow);
  if (categoryText && !company.rubro.opcion) {
    found.badCategories.push({ row, value: categoryText });
  }
  const crossed = crossedCap(sheetRow, company, options);
  if (crossed) found.crossed.push({ row, kind: crossed });
  if (!company.empresa) found.nameless.push(row);
  inspectCashback(company, row, found, cashbackNames);
  for (const cuit of company.cuits) {
    if (cuit.length !== TAX_ID_LENGTH) found.badTaxIds.push({ row, value: cuit });
  }
  found.rows.push(company);
}

function plural(count: number, one: string, many: string): string {
  return count > 1 ? many : one;
}

function listOf<T>(items: readonly T[], write: (item: T) => RichText): RichText {
  const shown = items.slice(0, LISTED).map(write);
  const more = items.length - LISTED;
  const all = more > 0 ? [...shown, [`y ${String(more)} más`]] : shown;
  const parts: RichPart[] = [];
  for (const [position, part] of all.entries()) {
    if (position > 0) parts.push(", ");
    parts.push(...part);
  }
  return parts;
}

function rowWithValue({ row, value }: Finding): RichText {
  return [`fila ${String(row)} ("${value}")`];
}

function missingColumns(found: Findings, columns: readonly string[]): SheetProblem[] {
  const hasCompany = columns.some(isCompanyColumn);
  const problems: SheetProblem[] = [];
  if (found.rows.length === 0) {
    problems.push({
      serious: true,
      text: [
        { strong: "No se pudo leer ninguna empresa." },
        " Revisá que la primera fila del Excel sean los encabezados y que haya una columna ",
        { code: "empresa" },
        ".",
      ],
    });
  } else if (!hasCompany) {
    problems.push({
      serious: true,
      text: [
        { strong: ["No encontré la columna ", { code: "empresa" }, "."] },
        " Las filas se van a guardar sin razón social. Renombrá esa columna a ",
        { code: "empresa" },
        ".",
      ],
    });
  }
  return problems;
}

function cashbackProblems(found: Findings, columns: readonly string[]): SheetProblem[] {
  if (!columns.some(isCashbackColumn)) {
    return [
      {
        serious: true,
        text: [
          { strong: "No encontré la columna del cashback." },
          " ",
          { strong: "Todas" },
          " las empresas van a salir ",
          { strong: "sin montos" },
          ". La columna tiene que llamarse ",
          { code: "config" },
          " (o ",
          { code: "cashback" },
          ").",
        ],
      },
    ];
  }
  const { badCashback, noCashback } = found;
  const problems: SheetProblem[] = [];
  if (badCashback.length > 0) {
    const many = badCashback.length > 1;
    problems.push({
      serious: false,
      text: [
        {
          strong: `${String(badCashback.length)} cashback${many ? "s que no reconozco" : " que no reconozco"}`,
        },
        ` → esa${many ? "s empresas van" : " empresa va"} a salir `,
        { strong: "sin montos" },
        ": ",
        ...listOf(badCashback, rowWithValue),
        ".",
        { lineBreak: true },
        "Si en realidad llevan cashback, corregilas. Valores válidos: ",
        { code: "BAU" },
        ", ",
        { code: "Config 1" },
        "…",
        { code: "Config 4" },
        " (también vale sólo el número). Para marcar que ",
        { strong: "no" },
        " corresponde, escribí ",
        { code: "SIN" },
        " o dejá la celda vacía.",
      ],
    });
  }
  if (noCashback > 0) {
    problems.push({
      serious: false,
      text: [
        {
          strong: `${String(noCashback)} empresa${plural(noCashback, " marcada", "s marcadas")} SIN cashback`,
        },
        " (",
        { code: "SIN" },
        " o celda vacía): su flyer sale con los importes en blanco. Si alguna no debería estar así, ponéle el cashback que corresponda.",
      ],
    });
  }
  return problems;
}

function crossedText({ row, kind }: CrossedFinding): RichText {
  const fuel = kind === "combustible";
  return [
    `fila ${String(row)} (rubro ${fuel ? "Combustible" : "Supermercado"}, pero el tope está en `,
    { code: fuel ? "tope_supermercado" : "tope_combustible" },
    ")",
  ];
}

function categoryProblems(found: Findings, { options }: SheetContext): SheetProblem[] {
  const { badCategories, crossed } = found;
  const problems: SheetProblem[] = [];
  if (badCategories.length > 0) {
    const many = badCategories.length > 1;
    const names = categoryOptions(options).map((option) => optionLabel(options, option));
    problems.push({
      serious: false,
      text: [
        {
          strong: `${String(badCategories.length)} rubro${many ? "s que no reconozco" : " que no reconozco"}`,
        },
        ` (queda${many ? "n" : ""} `,
        { strong: "sin rubro" },
        "): ",
        ...listOf(badCategories, rowWithValue),
        `. Valores válidos: el nombre de una opción de Flyer Rubros (${names.join(", ") || "ninguna configurada"}).`,
      ],
    });
  }
  if (crossed.length > 0) {
    const count = crossed.length;
    problems.push({
      serious: false,
      text: [
        { strong: `${String(count)} tope${plural(count, "", "s")} en la columna del otro rubro` },
        ": ",
        ...listOf(crossed, crossedText),
        ". Los tomé como tope de su rubro; si no era así, corregilos.",
      ],
    });
  }
  return problems;
}

function rowProblems({ badTaxIds, nameless, discarded }: Findings): SheetProblem[] {
  const problems: SheetProblem[] = [];
  if (badTaxIds.length > 0) {
    problems.push({
      serious: false,
      text: [
        { strong: `${String(badTaxIds.length)} CUIT sin 11 dígitos` },
        ": ",
        ...listOf(badTaxIds, rowWithValue),
        ". Se guardan igual, pero puede que no los encuentres al buscar.",
      ],
    });
  }
  if (nameless.length > 0) {
    const s = plural(nameless.length, "", "s");
    problems.push({
      serious: false,
      text: [
        { strong: `${String(nameless.length)} fila${s} sin razón social` },
        ` (fila${s} ${nameless.slice(0, LISTED_ROWS).join(", ")}). Sólo se van a poder buscar por CUIT.`,
      ],
    });
  }
  if (discarded > 0) {
    const s = plural(discarded, "", "s");
    problems.push({
      serious: false,
      text: [
        { strong: `${String(discarded)} fila${s} vacía${s}` } satisfies RichPart,
        ` (sin empresa ni CUIT): se descarta${plural(discarded, "", "n")}.`,
      ],
    });
  }
  return problems;
}

function unknownColumnsProblems(headers: ReadonlyMap<string, string>): SheetProblem[] {
  const unknown = [...headers].filter(([key]) => !isKnownColumn(key)).map(([, name]) => name);
  if (unknown.length === 0) return [];
  const more = unknown.length - LISTED_COLUMNS;
  return [
    {
      serious: false,
      text: [
        { strong: "Columnas que ignoré" },
        `: ${unknown.slice(0, LISTED_COLUMNS).join(", ")}${more > 0 ? ` y ${String(more)} más` : ""}. Si alguna debería usarse, revisá el nombre contra la plantilla.`,
      ],
    },
  ];
}

function headersOf(rows: readonly SheetRow[]): Map<string, string> {
  const headers = new Map<string, string>();
  for (const row of rows) {
    for (const name of Object.keys(row)) headers.set(columnKey(name), name);
  }
  return headers;
}

/** The companies of the sheet and what is strange in it. */
export function validateSheet(rows: readonly SheetRow[], context: SheetContext): SheetReport {
  const found: Findings = {
    rows: [],
    badCashback: [],
    badTaxIds: [],
    badCategories: [],
    crossed: [],
    nameless: [],
    noCashback: 0,
    discarded: 0,
  };
  for (const [position, row] of rows.entries()) inspectRow(row, position, found, context);
  const headers = headersOf(rows);
  const columns = [...headers.keys()];
  const problems = [
    ...missingColumns(found, columns),
    ...cashbackProblems(found, columns),
    ...categoryProblems(found, context),
    ...rowProblems(found),
    ...unknownColumnsProblems(headers),
  ];
  return {
    rows: found.rows,
    problems,
    discarded: found.discarded,
    serious: problems.filter(({ serious }) => serious).length,
  };
}
