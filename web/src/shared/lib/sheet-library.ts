// SheetJS, for the sheets of the app. npm and cdnjs stayed in an old version with known problems, so
// it is served from the site itself (libs/): a script that the browser checks against its hash, and
// that comes down the first time somebody touches a sheet.
import libraryAddress from "../../../../libs/xlsx-0.20.3.full.min.js?url";
import { createLibraryLoader, type LibraryLoader } from "./library-loader.ts";

// Worked out from the file when building: see scripts/vite/sheet-library-integrity.ts.
declare const SHEET_LIBRARY_HASH: string;

export type SheetCells = readonly (readonly string[])[];
export type ReadSheetRow = Readonly<Record<string, unknown>>;

interface WorkSheet {
  "!cols"?: readonly { readonly wch: number }[];
}

interface WorkBook {
  readonly SheetNames: readonly string[];
  readonly Sheets: Readonly<Record<string, WorkSheet>>;
}

export interface SheetApi {
  read(data: ArrayBuffer, options: { readonly type: "array" }): WorkBook;
  writeFile(book: WorkBook, fileName: string): void;
  readonly utils: {
    book_new(): WorkBook;
    book_append_sheet(book: WorkBook, sheet: WorkSheet, name: string): void;
    aoa_to_sheet(lines: SheetCells): WorkSheet;
    sheet_to_json(
      sheet: WorkSheet,
      options: { readonly defval: string; readonly raw: false },
    ): ReadSheetRow[];
  };
}

function isSheetApi(value: unknown): value is SheetApi {
  return typeof value === "object" && value !== null && "utils" in value && "read" in value;
}

export function bringSheetScript(address: string, integrity: string): Promise<SheetApi> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = address;
    script.integrity = integrity;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      const library: unknown = Reflect.get(window, "XLSX");
      if (isSheetApi(library)) resolve(library);
      else reject(new Error("The script of the sheets brought no library"));
    });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("The script of the sheets did not load"));
    });
    document.head.append(script);
  });
}

export const SHEET_LIBRARY: LibraryLoader<SheetApi> = createLibraryLoader(() =>
  bringSheetScript(libraryAddress, SHEET_LIBRARY_HASH),
);

/** The first sheet of a file, with each row by its headers and every cell as it reads on screen. */
export async function readSheetFile(library: SheetApi, file: Blob): Promise<ReadSheetRow[]> {
  const book = library.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
  return sheet ? library.utils.sheet_to_json(sheet, { defval: "", raw: false }) : [];
}

export interface SheetToWrite {
  readonly lines: SheetCells;
  readonly widths: readonly number[];
  readonly sheetName: string;
  readonly fileName: string;
}

export function downloadSheet(library: SheetApi, sheet: SheetToWrite): void {
  const book = library.utils.book_new();
  const content = library.utils.aoa_to_sheet(sheet.lines);
  content["!cols"] = sheet.widths.map((wch) => ({ wch }));
  library.utils.book_append_sheet(book, content, sheet.sheetName);
  library.writeFile(book, sheet.fileName);
}
