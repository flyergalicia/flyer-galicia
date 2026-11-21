// A logo from the PC, for brands that are not in Promociones. It stays only in the memory of this
// tab, with a key of its own that never goes to Galicia.
import { cleanLogo } from "@/shared/flyer-engine/index.ts";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1200;
const FORMATS = /^image\/(png|jpeg|webp)$/;

export type UploadFailure = "formato" | "pesado" | "imagen";

export interface UploadedLogo {
  readonly key: string;
  readonly name: string;
  readonly logo: HTMLCanvasElement;
  readonly isWhite: boolean;
}

/** Shrinks by half each time: going down in one pass pixelates thin letters. */
export function shrunk(source: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  let current: HTMLImageElement | HTMLCanvasElement = source;
  let [w, h] = [source.naturalWidth, source.naturalHeight];
  const step = (toWidth: number, toHeight: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = toWidth;
    canvas.height = toHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas here");
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, toWidth, toHeight);
    return canvas;
  };
  while (w / 2 >= width && h / 2 >= height) {
    current = step(Math.round(w / 2), Math.round(h / 2));
    [w, h] = [current.width, current.height];
  }
  return step(width, height);
}

/** Almost all white: a version for dark backgrounds, which can hardly be seen on the flyer. */
export function isAlmostWhite(canvas: HTMLCanvasElement): boolean {
  const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
  let [seen, light] = [0, 0];
  for (let offset = 0; offset < data.length; offset += 16) {
    if ((data[offset + 3] ?? 0) >= 128) {
      seen += 1;
      const isLight =
        (data[offset] ?? 0) > 225 && (data[offset + 1] ?? 0) > 225 && (data[offset + 2] ?? 0) > 225;
      if (isLight) light += 1;
    }
  }
  return seen > 20 && light > seen * 0.85;
}

function pictureOf(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const address = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(address);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(address);
      resolve(null);
    });
    image.src = address;
  });
}

let uploadedSoFar = 0;

function uniqueKey(fileName: string): string {
  uploadedSoFar += 1;
  return `pc:${Date.now().toString(36)}${uploadedSoFar.toString(36)}:${fileName}`;
}

export async function readLogoFile(file: File): Promise<UploadedLogo | UploadFailure> {
  if (!FORMATS.test(file.type)) return "formato";
  if (file.size > MAX_BYTES) return "pesado";
  const picture = await pictureOf(file);
  if (!picture) return "imagen";
  // A huge photo is not needed: a logo on the flyer measures a few hundred pixels.
  const { naturalWidth: w, naturalHeight: h } = picture;
  const factor = Math.min(1, MAX_SIDE / Math.max(w, h));
  const logo = cleanLogo(
    shrunk(picture, Math.max(1, Math.round(w * factor)), Math.max(1, Math.round(h * factor))),
  );
  return {
    key: uniqueKey(file.name),
    name: file.name.replace(/\.[a-z0-9]+$/i, ""),
    logo,
    isWhite: isAlmostWhite(logo),
  };
}

export function uploadFailureText(failure: UploadFailure): string {
  if (failure === "formato") return "Ese archivo no es una imagen PNG o JPG.";
  if (failure === "pesado") return "La imagen pesa más de 8 MB: probá con una más liviana.";
  return "No se pudo leer esa imagen. Probá con otra.";
}

export const WHITE_LOGO_TEXT =
  "Ese logo es blanco (para fondos oscuros): sobre el flyer casi no se va a ver. Si podés, subí la versión a color.";
