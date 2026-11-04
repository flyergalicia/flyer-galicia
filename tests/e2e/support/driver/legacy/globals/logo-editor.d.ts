// Globals of the current app for Cambiar logos. Only driver/legacy may use them: the lint
// policy forbids them in specs and the React app will not have them.

interface LegacyLogoChange {
  bw?: number;
  bh?: number;
  fs?: number;
  bfs?: number;
  color?: string;
  peso?: number;
  dup?: boolean;
}

interface LegacyLogoEditorState {
  list: LegacyLogoChange[];
  grupo: number[];
  lugares: unknown[];
  arrastre?: boolean;
  limpio?: boolean;
}

interface LegacyLogoDetection {
  error?: string;
}

interface LegacyLogoPickerState {
  res: LegacyPromotion[];
  det: LegacyLogoDetection | null;
}

interface LegacyUndoHistory {
  pasos: { et: string }[];
  /** The timer that will write down the last change; 0 when nothing is pending. */
  t: number;
}

interface Window {
  _fgLgHist: LegacyUndoHistory;
  /** The redraw waiting for the next frame; 0 when nothing is pending. */
  _fgLgRaf: number;
  _fgFr: { modo: boolean };
  _fgProtos: { temp?: boolean; nombre: string; id: string }[];
  showToast(message: string): void;
}

declare function _fgLgElegidos(): number[];
declare function _fgFrElegidos(state: LegacyStripState): number[];
declare function _fgLgDetectar(x: number, y: number): LegacyLogoDetection;
declare function _fgLgVencida(change: { img: string }): boolean;
declare function _fgLgIndiceDe(place: LegacyLogoDetection): number;
declare function _fgLgPonerTexto(
  place: LegacyLogoDetection,
  text: { texto: string; color: string; peso: number; fs: number },
  previous: null,
): void;
declare function _fgLgImg(key: string): HTMLCanvasElement | null;
declare function _fgLgLimpiarLogo(image: HTMLImageElement): HTMLCanvasElement;
