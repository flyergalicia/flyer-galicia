// What the rest of the app hands to the engine. Calibrations, values, logo changes and cuts are
// stored data (history, drafts, bucket), so their keys are a contract and stay in Spanish.

/** A picture the engine can draw from: a loaded flyer, or the canvas of a cropped one. */
export type FlyerArt = HTMLImageElement | HTMLCanvasElement;

export type FontWeight = number | string | null;

export interface CompanyZone {
  xc: number;
  yc: number;
  lh: number;
  mw: number;
  fs: number;
  ex: number;
  bg: string;
  color?: string;
  peso?: FontWeight;
  off?: boolean;
}

export interface AmountBox {
  xc: number;
  ew: number;
  col: string;
  y?: number | null;
  mh?: number | null;
}

export interface AmountsZone {
  y: number;
  fs: number;
  mh: number;
  bg: string;
  peso?: FontWeight;
  boxes: AmountBox[];
  off?: boolean;
}

export interface CashbackZone {
  xc: number;
  y: number;
  mw: number;
  mh: number;
  fs: number;
  minFs?: number;
  col?: string;
  peso?: FontWeight;
  bg: string;
  off?: boolean;
}

export interface ContactZone {
  ex: number;
  ey: number;
  ew: number;
  ew3?: number;
  eh: number;
  bg: string;
  y1: number;
  y2: number;
  y3: number;
  xSingle: number;
  xLeft: number;
  xRight: number;
  fnBold: number;
  frReg: number;
  color: string;
  peso?: FontWeight;
  ewS?: number;
  ehS?: number;
  sedeDy?: number;
  nomDy?: number;
  celDy?: number;
  mailDy?: number;
  fnSede?: number;
  colSede?: string;
  titH?: number;
  titFs?: number;
  titPeso?: FontWeight;
  titColor?: string;
}

export interface LegalZone {
  x0: number;
  yStart: number;
  yEnd: number;
  maxW: number;
  fs: number;
  lh: number;
  gap: number;
  minFs: number;
  minLh: number;
  minGap: number;
  color: string;
  bg: string;
}

export interface BenefitLine {
  t: string;
  x: number;
  y: number;
  fs: number;
  peso: number;
  color: string;
  align: string;
  mw: number;
  /** Line height: with it, the text wraps instead of only shrinking. */
  lh?: number;
  maxLin?: number;
  /** Lines of one group are one text split in lines: they shrink together. */
  g?: string;
  dx?: number;
}

/** The two loose fields a calibration saved by the previous version of the app may carry. */
export interface OldBenefitPart {
  pre?: string | null;
  post?: string | null;
  x: number;
  y: number;
  fs?: number;
  color?: string;
  align?: string;
  mw: number;
}

export interface RawBenefit {
  color2?: string;
  peso2?: number;
  lineas?: Partial<BenefitLine>[] | null;
  campos?: Readonly<Record<string, string>> | null;
  titulo?: OldBenefitPart;
  tope?: OldBenefitPart;
}

export interface BenefitZone {
  color2: string;
  peso2: number;
  lineas: BenefitLine[];
  campos: Readonly<Record<string, string>>;
}

/** A calibration as it is stored: `_active<n>.json`, `_flyer_cfgs.json`, or nothing at all. */
export interface RawCalibration {
  imgW?: number;
  imgH?: number;
  recDe?: number;
  cropH?: number;
  bottomMargin?: number | null;
  empresa?: Partial<CompanyZone>;
  montos?: Partial<AmountsZone>;
  cashback?: Partial<CashbackZone>;
  contacto?: Partial<ContactZone>;
  legal?: Partial<LegalZone>;
  benef?: RawBenefit;
}

/** A calibration with every default in place. */
export interface Calibration {
  imgW: number;
  imgH: number;
  recDe: number;
  cropH: number;
  bottomMargin: number;
  empresa: CompanyZone;
  montos: AmountsZone;
  cashback: CashbackZone;
  contacto: ContactZone;
  legal: LegalZone;
  benef: BenefitZone;
}

/** A section copied from another flyer, drawn in the gap a cut opens. */
export interface InsertedSection {
  /** Address of the image of the source flyer. */
  u: string;
  sy: number;
  sh: number;
  sw?: number;
  pad?: number;
}

/** One step of Recortar or Insertar: `y` and `h` are pixels of the image left by the steps before. */
export interface Cut {
  y: number;
  h: number;
  ins?: InsertedSection;
}

/** One change of Cambiar logos: what it covers (x, y, w, h) and what it draws (tx, ty, tw, th). */
export interface LogoChange {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  /** A place left empty draws nothing, and has none of these. */
  tx?: number;
  ty?: number;
  tw?: number;
  th?: number;
  img?: string;
  tipo?: string;
  texto?: string;
  fs?: number;
  peso?: FontWeight;
  color?: string;
  /** The stored entry has more keys, which only the logo editor reads. */
  [key: string]: unknown;
}

/** The first officer has no number in its keys: nombre, nombre2, nombre3... */
export const OFFICER_SLOTS = [
  [1, ""],
  [2, "2"],
  [3, "3"],
  [4, "4"],
  [5, "5"],
  [6, "6"],
  [7, "7"],
  [8, "8"],
] as const;
export type OfficerSlot = (typeof OFFICER_SLOTS)[number];
export type OfficerNumber = OfficerSlot[0];
export type OfficerSuffix = OfficerSlot[1];

type OfficerFields = Partial<
  Record<`${"nombre" | "celular" | "email"}${OfficerSuffix}`, string> &
    Record<`ubic${OfficerNumber}`, string> &
    Record<`has${OfficerNumber}`, boolean>
>;

/** Everything one flyer says. It travels whole so history, drafts and batches draw like the form. */
export type FlyerValues = OfficerFields & {
  empresa: string;
  nocb?: boolean;
  config?: string;
  m1?: string | number | null;
  m2?: string | number | null;
  m3?: string | number | null;
  m4?: string | number | null;
  legal?: string;
  sedes?: boolean;
  sedesTit?: string;
  benef?: boolean;
  /** Absent in old history entries: then the tab of the flyer decides. */
  cashUnico?: boolean | null;
  benefNombre?: string | null;
  importe?: string;
  importe2?: string;
  sinOficiales?: boolean;
  logos?: LogoChange[];
  logosSrc?: string;
  recortes?: Cut[];
  recBase?: string;
};

/** The flyer as it was left by Recortar or Insertar, before any cut. */
export interface WholeFlyer {
  readonly art: FlyerArt;
  readonly artKey: string;
  readonly rawCalibration: RawCalibration;
}

/**
 * The picture and its calibration, always together (invariant 22): a crop is another scene. It only
 * comes out of `loadFlyerArtwork` or `cropScene`, so a flyer that did not load cannot be drawn
 * (invariant 23).
 */
export interface FlyerScene {
  readonly art: FlyerArt;
  /** Which picture this is. Logo changes are only valid on the picture they were made on. */
  readonly artKey: string;
  readonly calibration: Calibration;
  /** The tab of this flyer draws one cashback amount instead of the four boxes. */
  readonly singleCashback: boolean;
  readonly whole: WholeFlyer;
  readonly cuts: readonly Cut[];
}

export interface FlyerFrame {
  readonly scene: FlyerScene;
  readonly values: FlyerValues;
  readonly scale: number;
}

/** What drawing leaves out, in base pixels: nothing else stays behind between two draws. */
export interface DrawnFlyer {
  /** Height added so that more officers fit. */
  readonly extra: number;
  /** Where the last content ends. */
  readonly contentBottom: number;
}

/** Where drawing finds the logos. It is `createLogoLibrary` in the app. */
export interface LogoSource {
  imageFor(key: string, art: FlyerArt, artKey: string): CanvasImageSource | null;
  /** A logo that is not in memory is asked for, and the library says when it arrives. */
  requestMissing(key: string): void;
  /** A text was drawn: the font of the flyer may still be on its way. */
  requestTextFont(): void;
}

/** One pass of drawing: its target, its scale and the extra height it opened. */
export interface DrawPass {
  readonly ctx: CanvasRenderingContext2D;
  readonly scale: number;
  /** The scale from calibration pixels to this target. */
  readonly effective: number;
  readonly scene: FlyerScene;
  readonly extra: number;
}
