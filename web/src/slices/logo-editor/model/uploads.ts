// The logos uploaded from the PC live only in the memory of a page: to survive they travel inside the
// draft or the design, smaller, as pictures.
import type { LogoLibrary, FlyerArt } from "@/shared/flyer-engine/index.ts";
import { isUploaded, type PlacedChange } from "./change.ts";

const LARGEST_SIDE = 600;

export type UploadMap = Readonly<Record<string, string>>;

function asPicture(canvas: HTMLCanvasElement): string {
  const factor = Math.min(1, LARGEST_SIDE / Math.max(canvas.width, canvas.height));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * factor));
  small.height = Math.max(1, Math.round(canvas.height * factor));
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/png");
}

/** What goes with a list. A logo no longer in memory that it already had stays: it is not lost. */
export function uploadsOf(
  list: readonly PlacedChange[],
  previous: UploadMap | null,
  logos: LogoLibrary,
  art: FlyerArt,
  artKey: string,
): UploadMap {
  const result: Record<string, string> = {};
  for (const { tipo, img } of list) {
    if (tipo !== "txt" && img && isUploaded(img) && !result[img]) {
      const image = logos.imageFor(img, art, artKey);
      if (image instanceof HTMLCanvasElement) result[img] = asPicture(image);
      else if (previous?.[img]) result[img] = previous[img];
    }
  }
  return result;
}

function pictureOf(address: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", reject);
    image.src = address;
  });
}

async function restoreOne(key: string, address: string, logos: LogoLibrary): Promise<void> {
  const image = await pictureOf(address);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  logos.put(key, canvas);
}

/**
 * Back in memory. `origins` says what each key came from: two old designs could bring the same key
 * with different pictures, and the second one showed that of the first.
 */
export async function restoreUploads(
  uploads: UploadMap,
  logos: LogoLibrary,
  origins: Map<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(uploads).map(async ([key, address]) => {
      const inMemory = logos.missingUploads([key]).length === 0;
      const origin = origins.get(key);
      if (inMemory && (origin === undefined || origin === address)) return;
      try {
        await restoreOne(key, address, logos);
        origins.set(key, address);
      } catch {
        // What did not come back is warned about by whoever opens it.
      }
    }),
  );
}

function logoName(key: string): string {
  return key.split(":").slice(2).join(":") || "logo";
}

/** The uploaded logos of a list that are nowhere: not in memory, nor in what it brings. */
export function missingUploads(
  list: readonly PlacedChange[],
  uploads: UploadMap,
  logos: Pick<LogoLibrary, "missingUploads">,
): readonly string[] {
  const keys = list.flatMap(({ tipo, img }) =>
    tipo !== "txt" && img && isUploaded(img) ? [img] : [],
  );
  return logos.missingUploads(keys).filter((key) => !uploads[key]);
}

export function missingUploadsText(keys: readonly string[]): string {
  const [first = ""] = keys;
  return keys.length === 1
    ? `Falta el logo subido de la PC «${logoName(first)}»: se perdió al recargar la página y en su lugar se ve el logo original. Volvé a subirlo con «Cambiar logos».`
    : `Faltan ${String(keys.length)} logos subidos de la PC (se perdieron al recargar la página): en esos lugares se ve el logo original. Volvé a subirlos con «Cambiar logos».`;
}
