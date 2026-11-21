export interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}

export interface DrawnRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface DrawnFlyer {
  width: number;
  height: number;
  texts: DrawnText[];
  rectangles: DrawnRectangle[];
}

export interface PreviewMetrics {
  /** The zoom of the preview, where 1 is its natural size. */
  zoom: number;
  scrollTop: number;
}

export interface PreviewWindowZoom {
  percent: number;
  open: boolean;
}

/** What specs can read of the flyer itself: what a download would contain, in flyer pixels. */
export interface FlyerDrawingDriver {
  /** Draws the flyer as a download does and reads what was written on it. */
  draw(): Promise<DrawnFlyer>;
  preview(): Promise<PreviewMetrics>;
  /** How many times the preview is drawn while something happens, with one frame to finish. */
  drawsWhile(action: () => Promise<void>): Promise<number>;
  /** The colors the preview uses to cover the amounts, at the zoom it has now. */
  previewCoverColors(): Promise<string[]>;
  /** Zooms in over a point of the flyer and tells where that point was and ended up. */
  pointUnderMouseAfterZoom(): Promise<{
    before: { x: number; y: number };
    after: { x: number; y: number };
  }>;
  /** Turns the wheel over the preview, with or without Ctrl. */
  wheelOverPreview(options: {
    ctrl: boolean;
    times: number;
    direction: "in" | "out";
  }): Promise<void>;
  /** Presses "Vista previa" and waits for its window. */
  openPreviewWindow(): Promise<void>;
  closePreviewWindow(): Promise<void>;
  previewWindowZoom(): Promise<PreviewWindowZoom>;
  wheelOverPreviewWindow(options: { ctrl: boolean; times: number }): Promise<void>;
  doubleClickPreviewWindow(): Promise<void>;
  /** Clicks outside the flyer, on the dark area of the window. */
  clickPreviewWindowBackground(): Promise<void>;
  /** Drags from over the flyer and lets go outside it. */
  dragOutOfPreviewWindow(): Promise<void>;
  /** Average color of the same region of the artwork alone. */
  artworkRegionColor(region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<number[]>;
}
