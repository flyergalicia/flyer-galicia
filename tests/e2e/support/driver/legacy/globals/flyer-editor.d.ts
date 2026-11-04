// Globals of the current app about the flyer editor, for its legacy driver.

interface LegacyFlyerValues {
  [field: string]: unknown;
  empresa?: string;
  nombre?: string;
  celular?: string;
  m1?: string;
  nocb?: boolean;
}

interface LegacyDraft {
  id: string;
  opcion: number;
  nombre: string;
  temp?: boolean;
  logos?: unknown[];
}

interface LegacyHistoryEntry {
  v: LegacyFlyerValues;
  fn: string;
  thumb: string;
  hora: string;
  ts: number;
  ac: number;
  opt: number;
}

interface LegacyLibrary {
  src: string;
  integrity?: string;
}

interface LegacySheetLibrary {
  utils: {
    aoa_to_sheet(rows: string[][]): unknown;
    book_new(): unknown;
    book_append_sheet(book: unknown, sheet: unknown, name: string): void;
    sheet_to_json<T>(sheet: unknown, options: { header: 1; raw: boolean }): T[];
  };
  write(book: unknown, options: { type: "base64"; bookType: "xlsx" }): string;
  read(
    data: string,
    options: { type: "base64" },
  ): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
}

interface LegacyZip {
  files: Record<string, { dir: boolean } | undefined>;
  file(name: string): { async(type: "string"): Promise<string> } | null;
}

interface LegacyDrawnFlyer {
  company: string;
  officer: string;
  phone: string;
  firstAmount: string;
  noCashback: boolean;
}

type LegacyCategoryCheck = (flyer: unknown, what: unknown, proceed: () => void) => boolean;

declare var XLSX: LegacySheetLibrary;
declare var JSZip: {
  loadAsync(data: Blob): Promise<LegacyZip>;
  prototype: { generateAsync(options?: unknown): Promise<unknown> };
};
declare var excelData: unknown[];
declare var flyerHistory: LegacyHistoryEntry[];
declare var _LIBS: Record<string, LegacyLibrary | undefined>;
declare var _libP: Record<string, Promise<unknown> | null>;
declare var _fgDlOcupado: boolean;
declare var _fgExtra: number;
declare var _fgContentBottomBase: unknown;
declare var _fgOptMeta: Record<number, boolean | undefined>;
declare var _fgProtos: LegacyDraft[];
declare var _fgProtoAct: string | null;
declare var _fgFav: number[];
declare var _fgBajarBlob: (blob: Blob, name?: string) => void;
declare var _padCheckRubro: LegacyCategoryCheck;
declare var showToast: (message: unknown) => void;

// What the driver leaves in the page while it watches a batch or a download.
declare var __fgRealZipDownload: ((blob: Blob, name?: string) => void) | undefined;
declare var __fgCapturedZips: Blob[];
declare var __fgRealDrawing: ((values: LegacyFlyerValues) => HTMLCanvasElement) | undefined;
declare var __fgDrawn: LegacyDrawnFlyer[];
declare var __fgRealCategoryCheck: LegacyCategoryCheck | undefined;
declare var __fgCategoryProceed: (() => void) | undefined;
declare var __fgRealSave: typeof savePDF | undefined;
declare var __fgSaveAttempts: number;
declare var __fgNotices: string[] | undefined;

declare function _lib(names: string): Promise<unknown>;
declare function _setVal(id: string, value: string): void;
declare function _fgSetNoCB(on: boolean): void;
declare function _optMetasPrecarga(): void;
declare function _fgVarianteSinCB(option: number): number;
declare function fgSplitBold(text: string): { text: string; bold: boolean }[];
declare function fgBorradorNuevo(): void;
declare function dlPDF(): void;
declare function dlPNG(): void;
declare function genAll(): void;
declare function clearExcel(): void;
declare function fgOptElegir(option: number): void;
declare function fgRedlPDF(index: number): void;
declare function savePDF(
  canvas: HTMLCanvasElement,
  values: LegacyFlyerValues,
  again?: boolean,
): void;
declare function _fgEnTanda(): boolean;
declare function _fgSinFlyerPoner(state: { opt: number; motivo: string } | null): void;
declare function _fgOptCargando(): boolean;
declare function _fgOptPartes(options: number[]): { fav: number | null; otras: number[] } | null;
declare function _facOptsDe(tab: string): number[];
declare function _facSyncOptBar(): void;
declare function _fgRenderOptBar(): void;
declare function fgOptFav(option: number): void;

interface Window {
  __fgAddresses?: { made: number; released: number };
}

interface Window {
  __fgRealDraw?: CanvasRenderingContext2D["drawImage"];
  __fgDraws?: number;
}
