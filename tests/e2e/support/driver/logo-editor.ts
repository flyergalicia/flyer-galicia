/** A position in flyer pixels: the same whatever the zoom or the screen. */
export interface FlyerPoint {
  x: number;
  y: number;
}

export interface LogoChange {
  kind: "brand" | "text" | "empty";
  title: string;
  /** Where the new logo is drawn, in rounded flyer pixels; null when nothing is drawn. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface LogoEditorDriver {
  /** Presses Cambiar logos. */
  enter(): Promise<void>;
  /**
   * Touches the logo at that point, searches for a brand and takes the first match.
   * Returns every match the search listed.
   */
  replaceWithBrand(at: FlyerPoint, search: string): Promise<{ matches: string[] }>;
  /** Touches the logo at that point and chooses "Dejar el lugar vacío". */
  leaveEmpty(at: FlyerPoint): Promise<void>;
  changes(): Promise<LogoChange[]>;
  /** How many logo changes a download would carry. */
  changesInDownload(): Promise<number>;
}
