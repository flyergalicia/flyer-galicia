// Globals of the current app for Armar franja. Only driver/legacy may use them: the lint
// policy forbids them in specs and the React app will not have them.

interface LegacyStripBrand {
  img: string;
  t: string;
  k?: number;
  dx?: number;
  dy?: number;
  sug?: boolean;
}

interface LegacyStripDrawnBox {
  tx: number;
  ty: number;
  tw: number;
  th: number;
}

interface LegacyStripListedBrand {
  imagen: string;
  titulo: string;
}

interface LegacyStripDetection {
  n: number;
  filas: { n: number }[];
  porFila: number;
}

interface LegacyStripState {
  rect: { x: number; y: number; w: number; h: number };
  info: LegacyStripDetection;
  previa: object | null;
  sel: LegacyStripBrand[];
  res: LegacyStripListedBrand[];
  cols: number;
  kt: number;
  elegido: number;
  rubro: string;
  una: boolean;
  sinOnline: boolean;
  _cajas?: (LegacyStripDrawnBox | undefined)[];
  _vista?: { x0: number; y0: number; ancho: number };
  _h?: { t: number };
}

interface LegacyLogoChange {
  bg?: string;
}

interface LegacyLogoPickerState {
  loc: string;
  rubro: string;
  una: boolean;
  sinOnline: boolean;
}

interface Window {
  _fgElegir: { st: { sel: { t: string }[] } } | null;
  _promosFiltros: { online: string };
  _promosRubro: string;
}

declare function _fgFrDetectar(
  x: number,
  y: number,
  width: number,
  height: number,
): LegacyStripDetection;
declare function _fgLgQuitarElegidos(): void;
declare function _promoEsOnline(promotion: LegacyPromosEntry): boolean;
declare function _promoBaseMarca(title: string): string;
declare function _promoClaveMarca(base: string, known: Record<string, number>): string;
