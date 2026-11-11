// A file becomes the picture of a flyer: 1240 px wide, on white, a JPEG and its canvas. PDF (its first
// page) or image.
import { registerProbe } from "../test-probe.ts";
import { PDF_READER, type PdfPage, VerifiedBinaries } from "./pdf-reader.ts";

const TARGET_WIDTH = 1240;
const JPEG_QUALITY = 0.92;
const PAUSE_MS = 40;
const LONG_NOTICE_MS = 8000;

/**
 * Drawing a page in one pass on a very tall canvas fails silently from ~4070 px down: half a flyer
 * comes out white, because of the transparency groups of its photos. So it goes by bands, and pdf.js
 * processes the whole page for each one: fewer bands, fewer passes. 3600 comes out the same as 1600 on
 * the flyers of Galicia (`flyer-sections/pdf-bands`), in half the time. Do not touch without verifying.
 */
export const BAND_HEIGHT = 3600;
/** ~1240×24000: some 120 MB of picture. Taller than this is stopped, with a notice. */
export const LARGEST_HEIGHT = 24_000;

export type FlyerNotice = (text: string, durationMs?: number) => void;

export interface RasterizedFlyer {
  readonly blob: Blob;
  readonly canvas: HTMLCanvasElement;
}

/** Null: it could not be converted, and it was said why. "no-reader": pdf.js itself did not arrive. */
export type RasterizeResult = RasterizedFlyer | null | "no-reader";

export function isPdfFile({ name, type }: Pick<File, "name" | "type">): boolean {
  return /\.pdf$/i.test(name) || type === "application/pdf";
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  return context;
}

function pause(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PAUSE_MS);
  });
}

function withBlob(canvas: HTMLCanvasElement): Promise<RasterizedFlyer | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob && { blob, canvas });
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function bandText(band: number, bands: number): string {
  if (bands <= 1) return "Convirtiendo PDF…";
  const slow = bands > 2 ? " (puede tardar un poco)" : "";
  return `Convirtiendo PDF… parte ${String(band + 1)} de ${String(bands)}${slow}`;
}

function bandsOf(height: number, bandHeight: number): readonly number[] {
  const tops: number[] = [];
  for (let top = 0; top < height; top += bandHeight) tops.push(top);
  return tops;
}

interface BandJob {
  readonly page: PdfPage;
  readonly viewport: ReturnType<PdfPage["getViewport"]>;
  readonly band: HTMLCanvasElement;
  readonly output: CanvasRenderingContext2D;
  readonly top: number;
  readonly height: number;
}

async function drawBand({ page, viewport, band, output, top, height }: BandJob): Promise<void> {
  band.height = height;
  const context = contextOf(band);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, band.width, height);
  try {
    // The transform goes before the viewport: it moves the drawing `top` pixels up.
    await page.render({
      canvas: band,
      canvasContext: context,
      viewport,
      transform: [1, 0, 0, 1, 0, -top],
    }).promise;
  } catch {
    // What the band managed to draw stays: the rest of the flyer goes on.
  }
  output.drawImage(band, 0, top);
}

/** The page on one canvas. A page too long says so, instead of freezing the computer. */
async function drawPage(
  page: PdfPage,
  notify: FlyerNotice,
  bandHeight: number,
): Promise<HTMLCanvasElement | null> {
  const viewport = page.getViewport({ scale: TARGET_WIDTH / page.getViewport({ scale: 1 }).width });
  const [width, height] = [Math.round(viewport.width), Math.round(viewport.height)];
  if (height > LARGEST_HEIGHT) {
    notify(
      `El PDF es demasiado largo para convertirlo (${String(height)} px de alto con 1240 de ancho). Partilo en dos o más PDF más cortos.`,
      LONG_NOTICE_MS,
    );
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const output = contextOf(canvas);
  output.fillStyle = "#fff";
  output.fillRect(0, 0, width, height);
  const tops = bandsOf(height, bandHeight);
  const band = document.createElement("canvas");
  band.width = width;
  // One breath before the first band: the notice gets painted before the heavy work.
  await pause();
  // One after the other, with a breath in between: the page answers while it works.
  const drawFrom = async (index: number): Promise<void> => {
    const top = tops[index];
    if (top === undefined) return;
    notify(bandText(index, tops.length));
    const tall = Math.min(bandHeight, height - top);
    await drawBand({ page, viewport, band, output, top, height: tall });
    await pause();
    await drawFrom(index + 1);
  };
  await drawFrom(0);
  band.width = 0;
  band.height = 0;
  return canvas;
}

async function rasterizePdf(
  file: File,
  notify: FlyerNotice,
  bandHeight: number,
): Promise<RasterizeResult> {
  let library: Awaited<ReturnType<typeof PDF_READER.load>>;
  try {
    library = await PDF_READER.load();
  } catch {
    notify("No se pudo cargar el lector de PDF");
    return "no-reader";
  }
  let task: ReturnType<typeof library.getDocument> | null = null;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    task = library.getDocument({
      data,
      useWorkerFetch: false,
      BinaryDataFactory: VerifiedBinaries,
    });
    const page = await (await task.promise).getPage(1);
    const canvas = await drawPage(page, notify, bandHeight);
    page.cleanup();
    return canvas && (await withBlob(canvas));
  } catch (cause) {
    notify(`Error leyendo PDF: ${cause instanceof Error ? cause.message : String(cause)}`);
    return null;
  } finally {
    // Its decoded images stayed in memory.
    void task?.destroy();
  }
}

function pictureOf(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const address = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(address);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(address);
      reject(new Error("It is not a picture"));
    });
    image.src = address;
  });
}

async function rasterizeImage(file: File, notify: FlyerNotice): Promise<RasterizeResult> {
  try {
    const image = await pictureOf(file);
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_WIDTH;
    canvas.height = Math.round(image.height * (TARGET_WIDTH / image.width));
    const context = contextOf(canvas);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await withBlob(canvas);
  } catch {
    notify("No se pudo leer la imagen");
    return null;
  }
}

export function rasterizeFlyer(
  file: File,
  notify: FlyerNotice,
  bandHeight = BAND_HEIGHT,
): Promise<RasterizeResult> {
  return isPdfFile(file) ? rasterizePdf(file, notify, bandHeight) : rasterizeImage(file, notify);
}

// What the comparison with real PDF needs: `flyer-sections/pdf-bands`.
registerProbe("pdfConversion", () => ({
  withBands: async (file: File, bandHeight: number) => {
    const result = await rasterizeFlyer(file, () => undefined, bandHeight);
    return result && result !== "no-reader" ? result.canvas : null;
  },
}));
