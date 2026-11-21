// What a strip keeps. These keys travel in `franjaSel` and `franjaInfo`, with the changes of the logos
// in history and Estudio, so they stay in Spanish.

/** One brand of the selection. */
export interface StripPick {
  readonly img: string;
  readonly t: string;
  /** Its size: 1 is the one it was given. */
  readonly k?: number;
  /** How far it was moved by hand, in pixels of the flyer. */
  readonly dx?: number;
  readonly dy?: number;
  /** It was added by "Sugerir marcas". */
  readonly sug?: boolean;
}

export interface StripRow {
  /** The height of its center. */
  readonly cy: number;
  readonly h: number;
  /** How many logos it has. */
  readonly n: number;
}

export interface StripBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What the app read of the logos printed in a strip. */
export interface StripInfo {
  readonly bg: string;
  readonly n: number;
  readonly filas: readonly StripRow[];
  readonly porFila: number;
  readonly medH: number;
  /** The original has its days under the logos, and how tall one line of them is. */
  readonly conTexto: boolean;
  readonly txtH: number;
  readonly maxH: number;
  /** The boxes of the logos, for Marcas guardadas. */
  readonly cajas: readonly StripBox[];
}

/** The box a strip fills. */
export interface StripRect extends StripBox {
  readonly bg: string;
  /** It passes over another drawing, which would be half covered. */
  readonly corta?: boolean;
}
