// The sheet of Mis empresas: its columns, and from a row to a company and back. What is downloaded
// can be uploaded again without touching anything, and an old sheet keeps being read.
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  capsOf,
  capText,
  kindOfCategory,
  type Options,
  optionOfCategory,
  optionOfText,
  storedCaps,
} from "./categories.ts";
import {
  type Company,
  type CompanyCategory,
  type CompanyOfficer,
  OFFICERS_PER_COMPANY,
  sanitizeCategory,
} from "./company.ts";
import { asText, columnKey, digitsOf, formatTaxId, parseTaxIds } from "./text.ts";

export type SheetRow = Readonly<Record<string, unknown>>;
type Cells = ReadonlyMap<string, string>;

export const COMPANY_COLUMNS = [
  "empresa",
  "razonsocial",
  "razsocial",
  "nombreempresa",
  "company",
  "cliente",
];
const TAX_ID_COLUMNS = ["cuit", "cuits", "cuitgrupo", "cuitsociedad"];
const CASHBACK_COLUMNS = [
  "config",
  "cashback",
  "tipocashback",
  "tipodecashback",
  "tipo",
  "configuracion",
];
const CATEGORY_COLUMNS = ["rubro", "rubros", "beneficio", "opcionrubro"];
const OLD_FIRST_CAP = ["tope", "importe", "tope1", "importe1"];
const OLD_SECOND_CAP = ["tope2", "importe2"];
const FUEL_CAP_COLUMNS = ["topecombustible", "combustible", "topecomb"];
const GROCERY_CAP_COLUMNS = [
  "topesupermercado",
  "supermercado",
  "topesuper",
  "super",
  "topesuperm",
];
const FIRST_OFFICER_COLUMNS = [
  "nombre",
  "asesornombre",
  "celular",
  "asesorcelular",
  "cel",
  "email",
  "mail",
  "asesoremail",
];
const NUMBERED_TAX_IDS = 10;
const NUMBERED_TAX_ID = /^cuit([1-9]|10)$/;
const OFFICER_COLUMN = /^asesor[1-4](nombre|celular|email)$/;

function officerColumns(): string[] {
  return Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) => {
    const number = String(position + 1);
    return [`asesor${number}_nombre`, `asesor${number}_celular`, `asesor${number}_email`];
  }).flat();
}

export const SHEET_COLUMNS: readonly string[] = [
  "empresa",
  "cuit",
  "config",
  ...officerColumns(),
  "rubro",
  "tope_combustible",
  "tope_supermercado",
];

export const SHEET_WIDTHS: readonly number[] = [
  34,
  30,
  10,
  ...Array.from({ length: OFFICERS_PER_COMPANY }, () => [24, 16, 38]).flat(),
  16,
  10,
  10,
];

const KNOWN_COLUMNS: ReadonlySet<string> = new Set([
  ...COMPANY_COLUMNS,
  ...TAX_ID_COLUMNS,
  ...CASHBACK_COLUMNS,
  ...CATEGORY_COLUMNS,
  ...OLD_FIRST_CAP,
  ...OLD_SECOND_CAP,
  ...FUEL_CAP_COLUMNS,
  ...GROCERY_CAP_COLUMNS,
  ...FIRST_OFFICER_COLUMNS,
]);

export function isCompanyColumn(key: string): boolean {
  return COMPANY_COLUMNS.includes(key);
}

export function isCashbackColumn(key: string): boolean {
  return CASHBACK_COLUMNS.includes(key);
}

export function isKnownColumn(key: string): boolean {
  return OFFICER_COLUMN.test(key) || NUMBERED_TAX_ID.test(key) || KNOWN_COLUMNS.has(key);
}

export function isTaxIdColumn(key: string): boolean {
  return TAX_ID_COLUMNS.includes(key) || NUMBERED_TAX_ID.test(key);
}

export function isOfficerColumn(key: string): boolean {
  return OFFICER_COLUMN.test(key) || FIRST_OFFICER_COLUMNS.includes(key);
}

/** Each column by its clean name, whatever the header said. */
function cellsOf(row: SheetRow): Cells {
  return new Map(Object.entries(row).map(([key, value]) => [columnKey(key), asText(value).trim()]));
}

function firstOf(cells: Cells, columns: readonly string[]): string {
  for (const column of columns) {
    const value = cells.get(column);
    if (value) return value;
  }
  return "";
}

function taxIdsOf(cells: Cells): string[] {
  const numbered = Array.from({ length: NUMBERED_TAX_IDS }, (_, position) =>
    parseTaxIds(cells.get(`cuit${String(position + 1)}`)),
  ).flat();
  return [...new Set([...parseTaxIds(firstOf(cells, TAX_ID_COLUMNS)), ...numbered])];
}

function officerOf(cells: Cells, position: number): CompanyOfficer {
  const number = String(position + 1);
  const isFirst = position === 0;
  const own = (part: string, ...fallback: readonly string[]) =>
    firstOf(cells, [`asesor${number}${part}`, ...(isFirst ? fallback : [])]);
  return {
    nombre: own("nombre", "nombre", "asesornombre"),
    celular: own("celular", "celular", "asesorcelular", "cel"),
    email: own("email", "email", "mail", "asesoremail"),
  };
}

function categoryOf(cells: Cells, options: Options): CompanyCategory {
  const text = firstOf(cells, CATEGORY_COLUMNS);
  const base = sanitizeCategory({ opcion: optionOfText(text, options), txt: text });
  const fuel = firstOf(cells, FUEL_CAP_COLUMNS);
  const grocery = firstOf(cells, GROCERY_CAP_COLUMNS);
  // With named columns, translated according to the category of this row. If not, an old sheet.
  return fuel || grocery
    ? { ...base, ...storedCaps(kindOfCategory(base, options), fuel, grocery) }
    : {
        ...base,
        importe: digitsOf(firstOf(cells, OLD_FIRST_CAP)),
        importe2: digitsOf(firstOf(cells, OLD_SECOND_CAP)),
      };
}

/** A row of the sheet as a company. Null when it has neither a name nor a tax id. */
export function companyOfSheetRow(row: SheetRow, options: Options): Company | null {
  const cells = cellsOf(row);
  const empresa = firstOf(cells, COMPANY_COLUMNS);
  const cuits = taxIdsOf(cells);
  if (!empresa && cuits.length === 0) return null;
  return {
    empresa,
    cuits,
    config: firstOf(cells, CASHBACK_COLUMNS),
    asesores: Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) =>
      officerOf(cells, position),
    ),
    rubro: categoryOf(cells, options),
  };
}

export function categoryTextOfRow(row: SheetRow): string {
  return firstOf(cellsOf(row), CATEGORY_COLUMNS);
}

/**
 * A company of one category whose cap came only in the column of the other: it is taken as its own,
 * and this says which one it was so as to warn about it.
 */
export function crossedCap(
  row: SheetRow,
  company: Pick<Company, "rubro">,
  options: Options,
): "combustible" | "supermercado" | "" {
  const cells = cellsOf(row);
  const has = (columns: readonly string[]) =>
    columns.some((column) => Boolean(digitsOf(cells.get(column))));
  const fuel = has(FUEL_CAP_COLUMNS);
  const grocery = has(GROCERY_CAP_COLUMNS);
  const kind = kindOfCategory(company.rubro, options);
  if (kind === "combustible" && grocery && !fuel) return kind;
  if (kind === "supermercado" && fuel && !grocery) return kind;
  return "";
}

function sheetLine(company: Company, options: Options): readonly string[] {
  const category = sanitizeCategory(company.rubro);
  const { fuel, grocery } = capsOf(category, options);
  const option = optionOfCategory(category, options);
  return [
    company.empresa,
    company.cuits.map(formatTaxId).join(", "),
    company.config,
    ...Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) => {
      const officer = company.asesores[position];
      return [officer?.nombre ?? "", officer?.celular ?? "", officer?.email ?? ""];
    }).flat(),
    // If the option is gone, the text it was loaded with: otherwise the category would be lost.
    option ? optionLabel(options, option) : category.txt,
    capText(fuel),
    capText(grocery),
  ];
}

export function sheetLines(
  companies: readonly Company[],
  options: Options,
): readonly (readonly string[])[] {
  return [SHEET_COLUMNS, ...companies.map((company) => sheetLine(company, options))];
}

function person(nombre = "", celular = "", email = ""): CompanyOfficer {
  return { nombre, celular, email };
}

/** How to fill in the sheet, for whoever downloads the empty one. */
export function templateCompanies(activeOption: (kind: "combustible" | "ambos") => number) {
  const first = person("Nombre Apellido", "11 1234 5678", "nombre.apellido@bancogalicia.com.ar");
  const rest = [person(), person(), person()];
  return [
    {
      empresa: "Pharma Sur S.A.",
      cuits: ["30712345678", "30709876543"],
      config: "Config 2",
      asesores: [first, ...rest],
      rubro: sanitizeCategory({
        opcion: activeOption("combustible"),
        txt: "Combustible",
        importe: "24000",
      }),
    },
    {
      empresa: "Empresa XYZ S.R.L.",
      cuits: ["30711111111"],
      config: "BAU",
      asesores: [
        person("Carlos Lopez", "11 4444 5555", "carlos.lopez@bancogalicia.com.ar"),
        person("Ana Perez", "11 5555 6666", "ana.perez@bancogalicia.com.ar"),
        person(),
        person(),
      ],
      rubro: sanitizeCategory({
        opcion: activeOption("ambos"),
        txt: "Ambos",
        importe: "20000",
        importe2: "30000",
      }),
    },
    {
      empresa: "Empresa Sin Beneficio SA",
      cuits: ["30700000001"],
      config: "SIN",
      asesores: [first, ...rest],
      rubro: sanitizeCategory(null),
    },
  ] satisfies readonly Company[];
}
