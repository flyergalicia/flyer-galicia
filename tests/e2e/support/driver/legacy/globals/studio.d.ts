// Globals of the current app for Estudio, cropping, inserting sections, drafts and saved
// brands. Only driver/legacy may use them: the lint policy forbids them in specs.

interface LegacyLogoChange {
  texto?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  ox?: number;
  oy?: number;
  ow?: number;
  oh?: number;
  franja?: unknown;
  franjaBase?: unknown;
}

interface LegacyLogoDetection {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LegacyLogoEditorState {
  on: boolean;
  sel: number;
  src: string;
  imgs: Record<string, HTMLCanvasElement | undefined>;
  imgsDe: Record<string, unknown>;
  proy: { id?: string; nombre?: string; temp?: boolean } | null;
}

interface LegacyLogoPickerState {
  prov: string;
  conDias: boolean;
}

interface LegacyInsertedStep {
  u: string;
  sy: number;
  sh: number;
  sw: number;
  pad: number;
}

interface LegacyCut {
  y: number;
  h: number;
  ins?: LegacyInsertedStep;
}

interface LegacyPromotion {
  id?: number;
  titulo: string;
  subtitulo?: string;
  imagen: string;
  provincias?: unknown;
  fecha_hasta?: string | null;
  proximamente?: boolean;
}

interface LegacyProto {
  id: string;
  nombre: string;
  temp?: boolean;
  subidos: Record<string, string>;
  cambios: unknown[];
}

interface LegacyLoggedLogo {
  img: string;
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LegacyFlyerValues {
  logosSrc?: string;
  recortes?: LegacyCut[];
  recBase?: string;
  empresa?: string;
}

interface LegacyHistoryEntry {
  v: LegacyFlyerValues;
  opt?: number;
  ac?: unknown;
  ts?: number;
  fn?: string;
  thumb?: string;
  hora?: string;
  fecha?: string;
}

interface LegacyPadronRecord {
  empresa: string;
  config: string;
  asesores: { nombre: string; celular: string; email?: string }[];
  rubro: string;
}

interface LegacyInsertSection {
  u: string;
  sy: number;
  sh: number;
  sw: number;
}

interface LegacyPlacementStep {
  modo: string;
  i: number;
  ocupado?: boolean;
}

interface LegacyStripState {
  res: LegacyPromotionHit[];
  sel: { img: string; t: string }[];
}

interface LegacyPromotionHit {
  imagen: string;
  titulo: string;
}

interface LegacyDraftsState {
  revisado?: boolean;
  ocupado?: boolean;
  avisoGrande?: boolean;
  avisoSinLugar?: boolean;
  pendientes?: LegacyPendingDraft[] | null;
}

interface LegacyPendingDraft {
  id: string;
  opcion: number;
  nombre: string;
  cambios: unknown[];
  recortes: unknown[];
  legal: string | null;
  subidos: Record<string, string>;
}

interface LegacyUploadedLogo {
  clave: string;
  nombre: string;
  logo: HTMLCanvasElement;
}

interface LegacySavedBrandsState {
  lista: { id?: string; nombre?: string }[] | null;
}

interface LegacyStudioState {
  lista: { id: string; nombre: string; estado?: string }[] | null;
  cargando?: boolean;
  publicando?: boolean;
}

interface LegacyStudioNotices {
  consulta: unknown[];
  comp: number;
}

interface Window {
  _fgLg: LegacyLogoEditorState;
  _fgLgV: LegacyLogoPickerState;
  _FG_BAND_H: number;
  _promosCat: LegacyPromotion[] | null;
  pdfjsLib: { version: string };
  __lostUploadRestore?: () => void;
  __pdfConverted?: boolean;
  __savedBrandsArtwork?: HTMLImageElement;
}

declare var _fgRec: { orig: HTMLImageElement; cortes: LegacyCut[] } | null;
declare var _fgRecM: { modo: boolean };
declare var _fgIns: {
  modo: boolean;
  sec: LegacyInsertSection | null;
  lista: unknown[] | null;
  imgs: Record<string, HTMLImageElement | undefined>;
};
declare var _fgProtoAct: string | null;
declare var _fgProtoTurno: number;
declare var _fgBorr: LegacyDraftsState;
declare var _EST: LegacyStudioState;
declare var _EST_FU: { ocupado: boolean };
declare var _estAv: LegacyStudioNotices;
declare var _MG: LegacySavedBrandsState;
declare var _mgPaso: LegacyPlacementStep | null;
declare var _fgFrSt: LegacyStripState;
declare var _FG_OPTS: number[];
declare var _OPC: Record<number, { sinCB?: number } | undefined>;
declare var _fgLgSubidos: number;
declare var _fgLgHist: { pasos: { et: string }[] };
declare var flyerHistory: LegacyHistoryEntry[];
declare var excelData: unknown[];

declare function _fgRecActivo(): boolean;
declare function fgRecAplicar(y: number, h: number): void;
declare function fgRecQuitar(): void;
declare function _fgSinImportes(): boolean;
declare function _fgCfg(): {
  empresa: { yc: number; off?: boolean };
  montos: Record<string, unknown>;
  cashback: Record<string, unknown>;
};
declare function _fgLegalConValores(text: string, values: LegacyFlyerValues): string;
declare function _fgLgPixeles(x: number, y: number, w: number, h: number): Uint8ClampedArray;
declare function _fgApplyOption(cache: LegacyOptionCache | undefined): void;
declare function _fgLgActivos(): LegacyLogoChange[];
declare function _fgLgBarra(): void;
declare function _fgLgListo(): void;
declare function _fgLgManual(x: number, y: number, w: number, h: number): LegacyLogoDetection;
declare function _fgLgTraer(file: string): Promise<HTMLCanvasElement>;
declare function _fgLgPoner(
  place: LegacyLogoDetection,
  file: string,
  title: string,
  logo: HTMLCanvasElement | null,
): void;
declare function _fgLgHistMarcar(): void;
declare function _fgLgMover(dx: number, dy: number): void;
declare function _fgLgTam(percent: number): void;
declare function _fgLgSrc(): string;
declare function _fgLgMarcas(): void;
declare function _fgLgLeerArchivo(file: File): Promise<LegacyUploadedLogo>;
declare function _fgHistDiseno(values: LegacyFlyerValues): void;
declare function _fgProtoBuscar(id: string | null): LegacyProto | null;
declare function _fgProtoActivo(): LegacyProto | null;
declare function fgProtoAbrir(id: string): void;
declare function fgOptElegir(option: number): void;
declare function fgEstGuardar(): void;
declare function fgLoadHistory(index: number): void;
declare function fgRedlPDF(index: number): void;
declare function savePDF(canvas: HTMLCanvasElement, values: unknown, again: boolean): void;
declare function _padApply(company: LegacyPadronRecord): void;
declare function _padCloseUpdate(option: number): void;
declare function _fgMontoN(values: LegacyFlyerValues, index: number): string;
declare function _fgVarianteSinCB(option: number): number;
declare function _fgOptBase(option: number): number;
declare function _pgOptDe(company: LegacyPadronRecord): number;
declare function genAll(): void;
declare function _fgBajarBlob(blob: Blob, name: string): void;
declare function _fgSinFlyerPoner(problem: { opt: number; motivo: string } | null): void;
declare function _estCargar(): void;
declare function _estPoll(): void;
declare function _estBuscar(id: string): object | null;
declare function _estPublicar(
  id: string,
  design: object | null,
  option: number,
  name: string,
): void;
declare function _estPrepararSubidos(uploads: Record<string, string>): Promise<void>;
declare function _estFuGuardarLista(change: (list: unknown[]) => unknown[]): Promise<void>;
declare function deactivateFlyer(button: unknown, option: number): void;
declare function loadUploadHistory(): void;
declare function _can(permission: string): boolean;
declare function _canOpt(option: number): boolean;
declare function _fgInsFaltan(cuts: LegacyCut[]): number;
declare function _fgInsFilas(image: HTMLImageElement | HTMLCanvasElement): number[];
declare function _fgBorradorCrear(option: number): LegacyProto;
declare function _fgBorrGuardar(): void;
declare function _fgBorrClave(): string;
declare function _fgBorrRecuperar(): void;
declare function _rasterizeFlyer(
  file: File,
  callback: (blob: Blob | null, canvas: HTMLCanvasElement | null) => void,
): void;

// Saved brands
declare function fgMarcasGuardadas(): void;
declare function fgMgAplicar(id: string): void;
declare function fgLgDeshacer(): void;
declare function fgLogosModo(on: boolean): void;
declare function _mgCargar(callback: () => void): void;
declare function _mgPintarListas(): void;
declare function _mgGuardar(): void;
declare function _mgPasoEnter(): void;
declare function _mgPasoTocar(
  left: number,
  top: number,
  right: number,
  bottom: number,
  dragged: boolean,
): void;
declare function _fgFrAbrir(place: LegacyLogoDetection): void;
declare function _fgFrLista(): void;
declare function _fgFrSelPintar(): void;
declare function _fgFrPreview(): void;
declare function _fgLgVencida(change: { img: string }): boolean;
declare function _fgLgDetectar(x: number, y: number): LegacyLogoDetection;
declare function _fgLgPonerMarca(
  place: LegacyLogoDetection,
  promotion: LegacyPromotion,
  logo: HTMLCanvasElement,
  withDays: boolean,
): void;
declare function _promoNormalizar(text: string): string;
declare function _fgLgAPantalla(
  x: number,
  y: number,
  w: number,
  h: number,
): { l: number; t: number; w: number; h: number };
