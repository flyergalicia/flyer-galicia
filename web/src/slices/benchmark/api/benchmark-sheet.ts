// The Excel of Benchmark, for whoever looks at the tab: it comes out with the filters and the
// reference purchases of the screen.
import type ExcelJS from "exceljs";
import { createLibraryLoader, type LibraryLoader } from "@/shared/lib/library-loader.ts";
import { saveFile, SHEET_TYPE } from "@/shared/lib/save-file.ts";
import type { BenchFilters, BrandIndex } from "../model/filters.ts";
import type { ReferencePurchases } from "../model/reference.ts";
import type { BenchPromotion, PremiumCard, SourceMeta } from "../model/rows.ts";
import {
  type Cell,
  rowsByBrand,
  rowsByDay,
  rowsByRubro,
  rowsOfCards,
  rowsOfPromotions,
  summaryLines,
} from "../model/sheet-rows.ts";

export type ExcelLibrary = typeof ExcelJS;
type Workbook = InstanceType<ExcelLibrary["Workbook"]>;

/** It weighs almost a mega: it comes down the first time somebody asks for the sheet. */
const EXCEL_LIBRARY = createLibraryLoader<ExcelLibrary>(() =>
  import("exceljs").then(({ default: library }) => library),
);

const MONEY = "$#,##0";
const HEADER_FILL = "FF14213D";
const WHITE = "FFFFFFFF";
const BOLD_LINES = [4, 10, 16, 20];
const AMOUNT_LINES = [11, 12, 13, 14];

/** key, header, width, number format. */
type Column = readonly [string, string, number, string?];

function addSheet(
  workbook: Workbook,
  name: string,
  columns: readonly Column[],
  rows: readonly Readonly<Record<string, Cell>>[],
): void {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(([key, header, width, format]) => ({
    header,
    key,
    width,
    style: format ? { numFmt: format } : {},
  }));
  for (const row of rows) sheet.addRow(row);
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: WHITE } };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
}

function addSummary(workbook: Workbook, lines: readonly Cell[][]): void {
  const sheet = workbook.addWorksheet("Resumen");
  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 46;
  for (const line of lines) sheet.addRow([...line]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  // As the current app does: since ICBC joined, the 20th line is a bank and not a title.
  for (const line of BOLD_LINES) sheet.getRow(line).font = { bold: true };
  for (const line of AMOUNT_LINES) sheet.getRow(line).getCell(2).numFmt = MONEY;
}

export interface SheetInputs {
  readonly filtered: readonly BenchPromotion[];
  readonly filters: BenchFilters;
  readonly references: ReferencePurchases;
  readonly meta: readonly SourceMeta[];
  readonly cards: readonly PremiumCard[];
  readonly brands: BrandIndex;
  readonly today: string;
}

const RUBRO_COLUMNS: readonly Column[] = [
  ["rubro", "Rubro", 20],
  ["compra", "Compra de referencia", 18, MONEY],
  ["banco", "Banco", 14],
  ["promos", "Promos vigentes", 12],
  ["devuelve", "Mejor: devuelve", 16, MONEY],
  ["pct", "%", 8],
  ["marca", "Marca", 26],
  ["tope", "Tope", 14, MONEY],
  ["dias", "Días", 22],
  ["cuotas", "Más cuotas sin interés", 14],
  ["marcaCuotas", "Marca (cuotas)", 26],
];

const BRAND_COLUMNS: readonly Column[] = [
  ["marca", "Marca", 28],
  ["rubro", "Rubro", 20],
  ["banco", "Banco", 14],
  ["devuelve", "Devuelve", 14, MONEY],
  ["pct", "%", 8],
  ["tope", "Tope", 14, MONEY],
  ["dias", "Días", 22],
  ["segmento", "Sólo para", 14],
  ["gana", "Gana", 8],
];

const DAY_COLUMNS: readonly Column[] = [
  ["dia", "Día", 12],
  ["banco", "Banco", 14],
  ["devuelve", "Devuelve", 14, MONEY],
  ["pct", "%", 8],
  ["marca", "Marca", 28],
  ["rubro", "Rubro", 20],
];

const CARD_COLUMNS: readonly Column[] = [
  ["banco", "Banco", 14],
  ["tarjeta", "Tarjeta", 26],
  ["paquete", "Paquete", 14],
  ["pases", "Pases VIP por año (titular)", 14],
  ["salas", "Salas VIP", 50],
  ["fast", "Fast Pass", 34],
  ["acomp", "Acompañantes y adicionales", 40],
  ["parking", "Parking", 30],
  ["seguros", "Seguros", 50],
  ["puntos", "Millas y puntos", 36],
  ["costo", "Costo", 44],
  ["vigencia", "Vigencia", 30],
  ["fuente", "Fuente", 40],
  ["conf", "De dónde sale", 18],
  ["rev", "Revisada", 12],
  ["notas", "Notas", 40],
];

const PROMOTION_COLUMNS: readonly Column[] = [
  ["banco", "Banco", 14],
  ["fuente", "Fuente", 12],
  ["marca", "Marca", 28],
  ["rubro", "Rubro", 20],
  ["beneficio", "Beneficio", 36],
  ["pct", "%", 8],
  ["tope", "Tope", 14, MONEY],
  ["por", "Tope por", 12],
  ["cuotas", "Cuotas sin interés", 12],
  ["dias", "Días", 22],
  ["tarjetas", "Tarjetas", 22],
  ["segmento", "Sólo para", 14],
  ["provincias", "Dónde vale", 30],
  ["desde", "Desde", 12],
  ["hasta", "Hasta", 12],
];

export async function writeBenchmarkSheet(
  library: ExcelLibrary,
  inputs: SheetInputs,
): Promise<ArrayBuffer> {
  const { filtered, filters, references, meta, cards, brands } = inputs;
  const workbook = new library.Workbook();
  workbook.creator = "Armador de flyers";
  workbook.created = new Date();
  addSummary(workbook, summaryLines(filters, references, meta, new Date()));
  addSheet(workbook, "Por rubro", RUBRO_COLUMNS, rowsByRubro(filtered, references));
  addSheet(workbook, "Por marca", BRAND_COLUMNS, rowsByBrand(filtered, references));
  addSheet(workbook, "Semana", DAY_COLUMNS, rowsByDay(filtered, references));
  addSheet(workbook, "Tarjetas y salas VIP", CARD_COLUMNS, rowsOfCards(cards));
  addSheet(workbook, "Promos", PROMOTION_COLUMNS, rowsOfPromotions(filtered, brands));
  return workbook.xlsx.writeBuffer();
}

/** Builds it and gives it to the browser: "Benchmark_AAAA-MM-DD.xlsx". */
export async function downloadBenchmarkSheet(
  inputs: SheetInputs,
  library: LibraryLoader<ExcelLibrary> = EXCEL_LIBRARY,
): Promise<void> {
  const content = await writeBenchmarkSheet(await library.load(), inputs);
  saveFile(content, `Benchmark_${inputs.today}.xlsx`, SHEET_TYPE);
}
