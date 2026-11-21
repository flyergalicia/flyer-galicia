export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function contextOf(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", options);
  if (!context) throw new Error("The browser gave no 2D context");
  return context;
}

/** The size of a picture itself, whatever size it may be shown at. */
export function pictureSize(art: HTMLImageElement | HTMLCanvasElement): {
  width: number;
  height: number;
} {
  if (art instanceof HTMLImageElement) {
    return { width: art.naturalWidth || art.width, height: art.naturalHeight || art.height };
  }
  return { width: art.width, height: art.height };
}
