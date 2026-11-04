// Globals of the current app outside the flyer: session, header, panel, screen search,
// Benchmark. Only driver/legacy may use them.

declare function closeAdminPanel(): void;
declare function closeUserMenu(): void;
declare function toggleTheme(): void;
declare function fgConfirm(message: string, onYes: () => void): void;
declare var _masBusy: boolean;
declare var _promosModo: string;
declare function fgLogosModo(on: boolean): void;
declare function _facOpts(): number[];
declare function _optLabel(option: number): string;
declare function _gesOn(): boolean;
declare function _cmdTecla(): string;
interface Window {
  GES?: { tab: string };
  __xss?: number;
}

/** A row as Benchmark keeps it: the columns of promos_bench_cache are contracts. */
interface LegacyBenchmarkRow {
  titulo: string;
  banco: string;
  rubro: string;
  fuente?: string | null;
  dias?: string | null;
  marca_clave?: string | null;
  bancos_n?: number | null;
  tope?: number | null;
  cuotas?: number | null;
}

interface LegacyBenchmarkState {
  vista: string;
  rows: LegacyBenchmarkRow[] | null;
  cargando: boolean;
  error: string;
}

interface Window {
  BEN?: LegacyBenchmarkState;
}

declare var BEN: LegacyBenchmarkState;
declare var benInit: unknown;
declare function benCargar(done?: () => void): void;
declare function benRender(): void;
declare function benFiltradas(): LegacyBenchmarkRow[];
declare function benDevuelve(row: LegacyBenchmarkRow): number | null;
declare function benMejor(
  rows: LegacyBenchmarkRow[],
): { r: LegacyBenchmarkRow; v: number } | null | undefined;
declare function benMasCuotas(rows: LegacyBenchmarkRow[]): { cuotas: number } | null | undefined;
declare function benSegTxt(row: object): string;
declare function benLink(row: object): string;
declare function benEmpieza(row: object): string;
declare function benTopeTxt(row: object): string;
declare var _FAC_DEF: Record<string, Record<string, boolean> | undefined>;
declare function _can(faculty: string): boolean;

declare const ExcelJS: {
  Workbook: new () => {
    xlsx: { load(data: ArrayBuffer): Promise<unknown> };
    worksheets: {
      name: string;
      rowCount: number;
      getRow(index: number): { values: ArrayLike<unknown> };
    }[];
  };
};
/** Added to what the logo editor keeps on the page. */
interface LegacyLogoEditorState {
  /** The clean preview is on. */
  limpio?: unknown;
}

declare function buildFn(pattern: string, values: Record<string, string>): string;
declare function openMiPadron(pane?: string): void;
declare function closeMiPadron(force?: boolean): void;

declare function setPalette(palette: string): void;
declare function switchAdminTab(tab: Element | null, sheet: string): void;

interface Window {
  _sb: { auth: { getSession: () => Promise<unknown> } };
}
declare var _updUltimo: number;
declare function _updChk(): void;
declare function showLoginView(view: string): void;

// The flyer calibrator.
interface LegacyCalibration {
  ds: number;
  sel: string | null;
  cfg: {
    imgH?: number;
    empresa?: { fs?: number; peso?: string; color?: string; yc?: number };
    montos?: { y?: number; boxes?: { y?: number; xc: number }[] };
    benef?: { lineas?: { t: string; x: number }[] };
    [zone: string]: unknown;
  };
}
declare var _cal: LegacyCalibration | null;
declare function _calZoneRects(): Record<string, { x: number; y: number; w: number; h: number }>;
declare function _calZones(): { id: string; label: string }[];
declare function _calSelect(zone: string): void;
declare function _calClose(): void;

interface Window {
  _hunV?: LegacyFlyerValues | null;
}
