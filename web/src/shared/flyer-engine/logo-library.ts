// The logos in memory. They come from a catalog, from the PC, or from the flyer itself.
import { contextOf, createCanvas } from "./canvas.ts";
import { cleanLogo } from "./logo-cleanup.ts";
import { createLogoTextFontLoader } from "./fonts.ts";
import { type FlyerArt, type LogoSource } from "./types.ts";

const UPLOADED_PREFIX = "pc:";
const FROM_FLYER_PREFIX = "orig:";
const RETRY_AFTER_MS = 60_000;

export interface LogoLibraryOptions {
  /** Brings the file of a logo of the catalog. Only the app knows where each one lives. */
  readonly fetchLogo: (key: string) => Promise<Blob>;
  /** Something that was missing arrived: time to draw again. */
  readonly onArrival: () => void;
  readonly fonts?: FontFaceSet;
  readonly now?: () => number;
}

export interface LogoLibrary extends LogoSource {
  /** Brings one logo, clean. Asked twice at the same time, it is one request. */
  fetch(key: string): Promise<HTMLCanvasElement>;
  /** Keeps an uploaded logo, which lives only in this page. */
  put(key: string, image: HTMLCanvasElement): void;
  /** Uploaded logos of a list that cannot be drawn, because the page was reloaded. */
  missingUploads(keys: readonly string[]): string[];
}

function pictureOfBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("The logo is not an image"));
    });
    image.src = url;
  });
}

/** "orig:x,y,w,h": a logo of the flyer itself that was moved or resized. */
function boxOf(key: string): readonly [number, number, number, number] | null {
  const parts = key.slice(FROM_FLYER_PREFIX.length).split(",").map(Number);
  const [x, y, width, height] = parts;
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return [x ?? 0, y ?? 0, width ?? 0, height ?? 0];
}

function cutFromFlyer(key: string, art: FlyerArt): HTMLCanvasElement | null {
  const box = boxOf(key);
  if (!box) return null;
  const [x, y, width, height] = box;
  const canvas = createCanvas(Math.max(1, width), Math.max(1, height));
  contextOf(canvas).drawImage(art, x, y, width, height, 0, 0, width, height);
  return cleanLogo(canvas, { keepMargins: true });
}

export function createLogoLibrary({
  fetchLogo,
  onArrival,
  fonts = document.fonts,
  now = Date.now,
}: LogoLibraryOptions): LogoLibrary {
  const images = new Map<string, HTMLCanvasElement>();
  const inFlight = new Map<string, Promise<HTMLCanvasElement>>();
  const failedAt = new Map<string, number>();

  const fetchClean = (key: string) => {
    const known = images.get(key);
    if (known) return Promise.resolve(known);
    const running = inFlight.get(key);
    if (running) return running;
    const request = fetchLogo(key)
      .then(pictureOfBlob)
      .then((image) => {
        const clean = cleanLogo(image);
        images.set(key, clean);
        return clean;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };

  return {
    fetch: fetchClean,
    put: (key, image) => {
      images.set(key, image);
    },
    missingUploads: (keys) => [
      ...new Set(keys.filter((key) => key.startsWith(UPLOADED_PREFIX) && !images.has(key))),
    ],
    imageFor: (key, art, artKey) => {
      if (!key.startsWith(FROM_FLYER_PREFIX)) return images.get(key) ?? null;
      const cacheKey = `${key}|${artKey}`;
      const known = images.get(cacheKey);
      if (known) return known;
      const logo = cutFromFlyer(key, art);
      if (logo) images.set(cacheKey, logo);
      return logo;
    },
    requestMissing: (key) => {
      if (key.startsWith(UPLOADED_PREFIX) || key.startsWith(FROM_FLYER_PREFIX)) return;
      // A logo that failed is not asked for again on every redraw, which is on every key.
      const failed = failedAt.get(key);
      if (failed !== undefined && now() - failed < RETRY_AFTER_MS) return;
      fetchClean(key).then(
        () => {
          failedAt.delete(key);
          onArrival();
        },
        () => {
          failedAt.set(key, now());
        },
      );
    },
    requestTextFont: createLogoTextFontLoader(fonts, onArrival),
  };
}
