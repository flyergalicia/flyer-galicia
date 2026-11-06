// What Config → Flyer reads and writes in the bucket: the active flyer of each option, the versions
// uploaded, and the calibration of each image.
import {
  readFlyerCalibrations,
  saveFlyerCalibration,
} from "@/shared/lib/app-config/flyer-files.ts";
import { activeFile } from "@/shared/lib/flyer-workspace/option-files.ts";
import { type Bucket, failure, type Result, success } from "@/shared/supabase/index.ts";
import {
  type ActiveFlyer,
  type ActiveFlyers,
  isImageName,
  newHtmlFile,
  type UploadedFlyer,
  withVersion,
} from "../model/flyer-config.ts";

const JSON_FILE = { contentType: "application/json", upsert: true } as const;
/** A year: the name carries the time, so this file is never written again (invariant 4). */
const YEAR_OF_CACHE = "31536000";
const LISTED_AT_MOST = 50;

function jsonBlob(content: unknown): Blob {
  return new Blob([JSON.stringify(content)], { type: "application/json" });
}

function text(value: unknown, key: string): string | null {
  const field: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
  return typeof field === "string" && field ? field : null;
}

/** What each option has active. A file that does not exist is "no flyer"; one that did not arrive is not. */
export async function readActiveFlyers(
  bucket: Bucket,
  options: readonly number[],
): Promise<ActiveFlyers> {
  const answers = await Promise.all(options.map((option) => bucket.readJson(activeFile(option))));
  const active = new Map<number, ActiveFlyer | null>();
  for (const [index, answer] of answers.entries()) {
    if (!answer.ok && answer.error.kind !== "not-found") {
      throw new Error("no se pudo leer qué flyer tiene cada opción");
    }
    const value = answer.ok ? answer.value : null;
    active.set(
      options[index] ?? 0,
      value === null
        ? null
        : {
            name: text(value, "name") ?? "",
            imageUrl: text(value, "imageUrl"),
            htmlUrl: text(value, "htmlUrl"),
          },
    );
  }
  return active;
}

/** The last fifty files uploaded, newest first, without the files of the app (`_…`). */
export async function readUploads(bucket: Bucket): Promise<UploadedFlyer[]> {
  const listed = await bucket.list("", {
    limit: LISTED_AT_MOST,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value
    .filter(({ name }) => !name.startsWith("_"))
    .map(({ name, created_at: createdAt, metadata }) => ({
      name,
      url: bucket.listedUrl(name),
      isImage: isImageName(name),
      createdAt: createdAt ?? null,
      size: metadata?.size ?? null,
    }));
}

async function writeActive(
  bucket: Bucket,
  option: number,
  content: Record<string, unknown>,
): Promise<Result<void, string>> {
  const written = await bucket.upload(
    activeFile(option),
    jsonBlob({ ...content, updated_at: new Date().toISOString() }),
    JSON_FILE,
  );
  return written.ok ? success(undefined) : failure(written.error.message);
}

/** The picture of a new flyer: its own name, kept a year. */
export async function uploadFlyerImage(
  bucket: Bucket,
  image: `flyer_${number}_op${number}.jpg`,
  blob: Blob,
): Promise<Result<void, string>> {
  const written = await bucket.upload(image, blob, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: YEAR_OF_CACHE,
  });
  return written.ok ? success(undefined) : failure(written.error.message);
}

/** An image already uploaded becomes the flyer of the option, with its calibration if it has one. */
export async function activateImage(
  bucket: Bucket,
  file: Pick<UploadedFlyer, "name" | "url">,
  option: number,
  stamp: number,
): Promise<Result<void, string>> {
  const calibrations = await readFlyerCalibrations(bucket);
  if (!calibrations.ok) return failure("no se pudieron leer las calibraciones guardadas");
  return writeActive(bucket, option, {
    name: file.name,
    imageUrl: withVersion(file.url, stamp),
    cfg: calibrations.value[file.name] ?? null,
  });
}

/** Takes the picture out, not the option: it stays on the bar with its notice. */
export function deactivateFlyer(bucket: Bucket, option: number): Promise<Result<void, string>> {
  return writeActive(bucket, option, { name: "", imageUrl: null });
}

export async function removeUpload(bucket: Bucket, name: string): Promise<Result<void, string>> {
  const removed = await bucket.remove([name]);
  return removed.ok ? success(undefined) : failure(removed.error.message);
}

export interface Calibrated {
  readonly name: string;
  readonly url: string;
  readonly option: number;
  readonly cfg: unknown;
}

/** "Guardar y activar": the calibration under the name of the image, and the flyer of the option. */
export async function saveAndActivate(
  bucket: Bucket,
  { name, url, option, cfg }: Calibrated,
  stamp: number,
): Promise<Result<void, { readonly step: "save" | "activate"; readonly message: string }>> {
  const saved = await saveFlyerCalibration(bucket, name, cfg);
  if (!saved.ok) return failure({ step: "save", message: saved.error });
  const active = await writeActive(bucket, option, {
    name,
    imageUrl: withVersion(url, stamp),
    cfg,
  });
  return active.ok ? success(undefined) : failure({ step: "activate", message: active.error });
}

/** The HTML of the build, as it is: its option is chosen when it is activated. */
export async function uploadHtml(
  bucket: Bucket,
  file: Blob,
  stamp: number,
): Promise<Result<string, string>> {
  const name = newHtmlFile(stamp);
  const written = await bucket.upload(name, file, { contentType: "text/html", upsert: true });
  return written.ok ? success(bucket.listedUrl(name)) : failure(written.error.message);
}

interface HtmlPicture {
  readonly blob: Blob;
  readonly type: string;
  readonly extension: "jpg" | "png";
}

/** The picture the HTML of the build carries inside, as `baseImg.src = "data:image…"` (the last one). */
export function pictureInHtml(html: string): HtmlPicture | null {
  const found = [...html.matchAll(/baseImg\.src\s*=\s*["'](data:image[^"']+)["']/g)].at(-1)?.[1];
  if (!found) return null;
  const comma = found.indexOf(",");
  const type = found.slice(5, found.indexOf(";"));
  const binary = atob(found.slice(comma + 1));
  const bytes = Uint8Array.from(binary, (letter) => letter.codePointAt(0) ?? 0);
  const extension = type.includes("jpeg") || type.includes("jpg") ? "jpg" : "png";
  return { blob: new Blob([bytes], { type }), type, extension };
}

/** The calibration the HTML carries in `<script id="flyer-cfg">`; null if it has none. */
export function calibrationInHtml(html: string): unknown {
  const found = /<script[^>]*id=["']flyer-cfg["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (found === undefined) return null;
  try {
    return JSON.parse(found) as unknown;
  } catch {
    return null;
  }
}

function htmlPictureName(
  option: number,
  extension: "jpg" | "png",
): `_active_img.${"jpg" | "png"}` | `_active${number}_img.${"jpg" | "png"}` {
  return option === 1 ? `_active_img.${extension}` : `_active${option}_img.${extension}`;
}

/**
 * Activating an HTML of the build: its picture is taken out and uploaded alone, so people bring the
 * picture and not the whole HTML. Its name is fixed: the address takes a version (invariant 4).
 */
export async function activateHtml(
  bucket: Bucket,
  file: Pick<UploadedFlyer, "name" | "url">,
  option: number,
  stamp: number,
): Promise<Result<void, string>> {
  const html = await bucket.readText(file.name);
  if (!html.ok) {
    const { status } = html.error;
    return failure(status === null ? "sin conexión" : `HTTP ${String(status)}`);
  }
  const picture = pictureInHtml(html.value);
  if (!picture) return failure("No se encontró la imagen en el HTML");
  const image = htmlPictureName(option, picture.extension);
  const uploaded = await bucket.upload(image, picture.blob, {
    contentType: picture.type,
    upsert: true,
  });
  if (!uploaded.ok) return failure(uploaded.error.message);
  return writeActive(bucket, option, {
    name: file.name,
    htmlUrl: file.url,
    imageUrl: withVersion(bucket.publicUrl(image), stamp),
    cfg: calibrationInHtml(html.value),
  });
}
