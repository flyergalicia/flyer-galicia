// The way out of a flyer: PDF, PNG and the names of the files. A result says whether the file came
// out, so that nobody says "descargado" before it did (invariant 24).
import { failure, type Result, success } from "@/shared/supabase/index.ts";
import { type FlyerValues } from "./types.ts";

const PDF_WIDTH_MM = 210;
const PDF_JPEG_QUALITY = 0.95;
const MAX_NAME = 120;
/** Slow PCs or an antivirus can take long to write a download before it can be let go. */
const RELEASE_BLOB_AFTER_MS = 60_000;

export interface OutputFailure {
  readonly kind: "library" | "generation";
  readonly detail: string;
}

export interface FlyerPdf {
  save(name: string): void;
  toArrayBuffer(): ArrayBuffer;
}

export function detailOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** One page 210 mm wide and exactly as tall as the flyer, with the image in JPEG. */
function buildPdf(library: typeof import("jspdf"), canvas: HTMLCanvasElement): FlyerPdf {
  const { jsPDF } = library;
  const height = (canvas.height / canvas.width) * PDF_WIDTH_MM;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PDF_WIDTH_MM, height] });
  const image = canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
  pdf.addImage(image, "JPEG", 0, 0, PDF_WIDTH_MM, height);
  return {
    save: (name) => {
      pdf.save(name);
    },
    toArrayBuffer: () => pdf.output("arraybuffer"),
  };
}

export async function createFlyerPdf(
  canvas: HTMLCanvasElement,
): Promise<Result<FlyerPdf, OutputFailure>> {
  let library: typeof import("jspdf");
  try {
    library = await import("jspdf");
  } catch (cause) {
    return failure({ kind: "library", detail: detailOf(cause) });
  }
  try {
    return success(buildPdf(library, canvas));
  } catch (cause) {
    return failure({ kind: "generation", detail: detailOf(cause) });
  }
}

export async function saveFlyerPdf(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<Result<true, OutputFailure>> {
  const pdf = await createFlyerPdf(canvas);
  if (!pdf.ok) return pdf;
  try {
    pdf.value.save(`${name}.pdf`);
    return success(true);
  } catch (cause) {
    return failure({ kind: "generation", detail: detailOf(cause) });
  }
}

export function saveFlyerPng(canvas: HTMLCanvasElement, name: string): Result<true, OutputFailure> {
  try {
    const link = document.createElement("a");
    link.download = `${name}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return success(true);
  } catch (cause) {
    return failure({ kind: "generation", detail: detailOf(cause) });
  }
}

/** Downloads what is in memory (the ZIP of a batch) and lets it go: 100 flyers are about 120 MB. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  document.body.append(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, RELEASE_BLOB_AFTER_MS);
}

/** What Windows refuses in a name goes away, and a "/" in a company no longer makes a folder in a ZIP. */
export function safeFileName(raw: string | null | undefined): string {
  const text = (raw ?? "")
    .replaceAll(/[\\/:*?"<>|]+/g, "-")
    .split("")
    .filter((character) => character >= " ")
    .join("")
    .replaceAll(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
  return text.slice(0, MAX_NAME) || "flyer";
}

function dateOf(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

export interface FileNameContext {
  readonly now: Date;
  /** The name of the active configuration, for the values that do not bring one. */
  readonly configuration: string;
}

/** The pattern of the name field. A marker with nothing to say goes away with its loose separators. */
export function buildFileName(
  pattern: string | null | undefined,
  values: FlyerValues,
  { now, configuration }: FileNameContext,
): string {
  const name = (pattern || "Flyer {empresa}")
    .replaceAll("{empresa}", () => values.empresa || "")
    .replaceAll("{asesor}", () => values.nombre || "")
    .replaceAll("{config}", () => values.config || configuration)
    .replaceAll("{fecha}", dateOf(now))
    .replaceAll(/(\s*[-_–]\s*){2,}/g, " - ")
    .replaceAll(/^[\s\-_–]+|[\s\-_–]+$/g, "");
  return safeFileName(name || "Flyer");
}

/** The date of a ZIP: Flyers_Galicia_2026-11-04.zip. */
export function dateForFileName(now: Date): string {
  return dateOf(now);
}
