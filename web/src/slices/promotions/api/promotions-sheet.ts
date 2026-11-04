// The Excel of what is on the table: filters applied and without what was ticked out. With the logo
// on each row, which is why it uses ExcelJS and not the library of the other sheets.
import {
  benefitText,
  decodeEntities,
  formatDate,
  isModoPromotion,
  isNewPromotion,
  normalizeText,
  ownDays,
  promotionLink,
  promotionNote,
  provinceList,
  type PromotionStatus,
  statusText,
  whereText,
} from "@/shared/domain/promotions/index.ts";
import { createLibraryLoader, type LibraryLoader } from "@/shared/lib/library-loader.ts";
import { fetchLogoFile } from "@/shared/lib/promotions/logo-file.ts";
import type ExcelJS from "exceljs";
import type { ResultRow } from "../model/result-rows.ts";

/** Each logo is a download: with a long list that makes the site fail, and the data is what counts. */
const MAX_ROWS_WITH_LOGOS = 150;
const LOGOS_AT_ONCE = 6;
const LOGO_SIZE = 26;
const ROW_HEIGHT = 32;
const NEW_TAB_REVOKE_MS = 4000;
const SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LINK_COLOR = "FF1155CC";
const NO_FILL = "FFFFFFFF";

const FILLS: Readonly<Record<PromotionStatus, string>> = {
  VIGENTE: "FFDFF5E1",
  VENCE_ESTE_MES: "FFFFF1CC",
  VENCIDA: "FFFCE0DF",
  REVISAR: "FFFFE7D1",
  NO_ENCONTRADA: "FFECECEC",
  SIN_FECHA: "FFECECEC",
  FUERA_PROV: "FFEAE6F9",
  PROXIMA: "FFE0EEFB",
};

export type ExcelLibrary = typeof ExcelJS;
type ImageFormat = "jpeg" | "png" | "gif";
type Workbook = InstanceType<ExcelLibrary["Workbook"]>;
type Worksheet = ReturnType<Workbook["addWorksheet"]>;

function imageFormat(file: string): ImageFormat | null {
  if (/\.jpe?g$/i.test(file)) return "jpeg";
  if (/\.png$/i.test(file)) return "png";
  return /\.gif$/i.test(file) ? "gif" : null;
}

function columnsOf(isActiveTab: boolean) {
  return [
    { header: "Logo", key: "logo", width: 12 },
    ...(isActiveTab ? [] : [{ header: "Marca (flyer)", key: "brand", width: 24 }]),
    { header: isActiveTab ? "Promoción" : "Coincidencia en Galicia", key: "match", width: 28 },
    { header: "Beneficio", key: "benefit", width: 26 },
    { header: "Categoría", key: "category", width: 18 },
    { header: "Dónde", key: "where", width: 30 },
    { header: "Desde", key: "startDate", width: 12 },
    { header: "Hasta", key: "endDate", width: 12 },
    { header: "Días", key: "days", width: 16 },
    { header: "Estado", key: "status", width: 16 },
    { header: "Origen", key: "origin", width: 10 },
    { header: "En Galicia", key: "link", width: 14 },
  ];
}

function benefitOf(row: ResultRow): string {
  const note = promotionNote(row.promotion);
  return benefitText(row.promotion) + (note ? ` (${note})` : "");
}

function valuesOf(row: ResultRow) {
  const { promotion } = row;
  const status = statusText(row.status, row.startDate);
  if (!promotion) {
    return {
      brand: row.brand,
      match: "-",
      category: "-",
      where: "-",
      startDate: "-",
      endDate: "-",
      days: "",
      benefit: "",
      status,
      origin: "",
    };
  }
  return {
    brand: row.brand,
    match: decodeEntities(promotion.titulo) + (isNewPromotion(promotion) ? " (nueva)" : ""),
    category: decodeEntities(promotion.subtitulo || "-"),
    where: whereText(promotion) || "-",
    startDate: formatDate(row.startDate),
    endDate: formatDate(promotion.fecha_hasta),
    days: ownDays(promotion),
    benefit: benefitOf(row),
    status,
    origin: isModoPromotion(promotion) ? "MODO" : "Galicia",
  };
}

function addRow(sheet: Worksheet, row: ResultRow): void {
  const added = sheet.addRow(valuesOf(row));
  added.height = ROW_HEIGHT;
  added.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: FILLS[row.status] || NO_FILL },
    };
  });
  // After the fill, so that the look of a link is not stepped on.
  const link = added.getCell("link");
  const address = promotionLink(row.promotion);
  if (address) {
    link.value = { text: "Ver", hyperlink: address };
    link.font = { color: { argb: LINK_COLOR }, underline: true };
  } else {
    link.value = "-";
  }
}

/** Runs one at a time up to the limit: all together, the last ones were rejected. */
function createQueue(limit: number) {
  const waiting: (() => void)[] = [];
  let running = 0;
  const next = () => {
    if (running >= limit) return;
    waiting.shift()?.();
  };
  return <T>(work: () => Promise<T>): Promise<T> =>
    new Promise((resolve) => {
      waiting.push(() => {
        running += 1;
        void work()
          .then(resolve)
          .finally(() => {
            running -= 1;
            next();
          });
      });
      next();
    });
}

interface LogoCount {
  placed: number;
  missing: number;
}

function addLogos(
  workbook: Workbook,
  sheet: Worksheet,
  rows: readonly ResultRow[],
  logoSource: (image: string) => string,
): Promise<LogoCount> {
  const queue = createQueue(LOGOS_AT_ONCE);
  const count: LogoCount = { placed: 0, missing: 0 };
  // The logo of a brand with several promotions goes down and in the file only once.
  const images = new Map<string, Promise<number | null>>();
  const imageOf = (file: string, extension: ImageFormat) => {
    const known = images.get(file);
    if (known) return known;
    const image = queue(async () => {
      const buffer = await fetchLogoFile(logoSource(file));
      return buffer ? workbook.addImage({ buffer, extension }) : null;
    });
    images.set(file, image);
    return image;
  };
  const placeLogo = async (row: ResultRow, position: number) => {
    const file = row.promotion?.imagen;
    if (!file) return;
    const extension = imageFormat(file);
    const image = extension ? await imageOf(file, extension) : null;
    if (image === null) {
      count.missing += 1;
      return;
    }
    sheet.addImage(image, {
      tl: { col: 0, row: position + 1 },
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
      editAs: "oneCell",
    });
    count.placed += 1;
  };
  return Promise.all(rows.map(placeLogo)).then(() => count);
}

function logosNotice(rowCount: number, { placed, missing }: LogoCount): string | null {
  if (rowCount > MAX_ROWS_WITH_LOGOS) {
    return `Excel generado sin logos: son ${String(rowCount)} filas y bajarlos de a una haría fallar la descarga.`;
  }
  if (missing > 0 && placed === 0) {
    return "Excel generado sin logos (no se pudieron descargar desde Galicia). Los datos están completos.";
  }
  return missing > 0
    ? `Excel generado; ${String(missing)} logo(s) no se pudieron descargar.`
    : null;
}

function fileNameOf(isActiveTab: boolean, province: string): string {
  const places = provinceList(province).map((name) => normalizeText(name).replace(/ +/g, "_"));
  const place = places.length > 0 ? `_${places.join("_")}` : "";
  const today = new Date().toISOString().slice(0, 10);
  return `${isActiveTab ? "promociones_activas" : "promociones_galicia"}${place}_${today}.xlsx`;
}

function saveFile(content: ArrayBuffer, name: string): void {
  const address = URL.createObjectURL(new Blob([content], { type: SHEET_TYPE }));
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, NEW_TAB_REVOKE_MS);
}

/** It weighs almost a mega: it comes down the first time somebody asks for a sheet. */
const EXCEL_LIBRARY = createLibraryLoader<ExcelLibrary>(() =>
  import("exceljs").then(({ default: library }) => library),
);

export interface SheetRequest {
  /** Where the library comes from. */
  readonly library?: LibraryLoader<ExcelLibrary>;
  readonly rows: readonly ResultRow[];
  readonly isActiveTab: boolean;
  readonly province: string;
  readonly logoSource: (image: string) => string;
  readonly notice: (text: string) => void;
  readonly setBusy: (on: boolean) => void;
}

async function writeSheet(library: ExcelLibrary, request: SheetRequest): Promise<void> {
  const { rows, isActiveTab, province, logoSource, notice } = request;
  const workbook = new library.Workbook();
  const sheet = workbook.addWorksheet(isActiveTab ? "Promociones activas" : "Promociones");
  sheet.columns = columnsOf(isActiveTab);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) addRow(sheet, row);
  const logos =
    rows.length <= MAX_ROWS_WITH_LOGOS
      ? await addLogos(workbook, sheet, rows, logoSource)
      : { placed: 0, missing: 0 };
  const content = await workbook.xlsx.writeBuffer();
  const said = logosNotice(rows.length, logos);
  if (said) notice(said);
  saveFile(content, fileNameOf(isActiveTab, province));
}

let waitingForLibrary = false;

/** The library comes down the first time. A second press meanwhile does not ask for another sheet. */
async function libraryOrNotice(
  library: LibraryLoader<ExcelLibrary>,
  notice: (text: string) => void,
): Promise<ExcelLibrary | null> {
  if (waitingForLibrary) return null;
  if (!library.isReady()) notice("Preparando el Excel…");
  waitingForLibrary = true;
  try {
    return await library.load();
  } catch {
    notice("No se pudo preparar el Excel. Revisá la conexión y probá de nuevo.");
    return null;
  } finally {
    waitingForLibrary = false;
  }
}

export async function downloadPromotionsSheet(request: SheetRequest): Promise<void> {
  const { library: loader = EXCEL_LIBRARY, notice, setBusy, rows } = request;
  const library = await libraryOrNotice(loader, notice);
  if (!library) return;
  if (rows.length === 0) {
    notice("No hay filas para exportar con el filtro actual");
    return;
  }
  setBusy(true);
  try {
    await writeSheet(library, request);
  } catch (cause) {
    notice(`Error generando el Excel: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    setBusy(false);
  }
}
