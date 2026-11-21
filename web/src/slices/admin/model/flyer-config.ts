// Config → Flyer: what a file can be, how a new picture is named, and what the list of flyers says of
// each option and of each version uploaded.

export const ACCEPTED_FLYER_FILES = ".pdf,.png,.jpg,.jpeg,.html,application/pdf,image/*,text/html";
const LARGEST_FILE = 25 * 1024 * 1024;

export type FlyerFileKind = "html" | "pdf" | "image";

interface FileFacts {
  readonly name: string;
  readonly type: string;
  readonly size?: number;
}

/** An HTML of the build goes up as it is; a PDF or an image is converted and calibrated. */
export function flyerFileKind({ name, type }: FileFacts): FlyerFileKind | null {
  if (/\.html?$/i.test(name) || type === "text/html") return "html";
  if (/\.pdf$/i.test(name) || type === "application/pdf") return "pdf";
  if (/\.(?:png|jpe?g)$/i.test(name) || type.startsWith("image/")) return "image";
  return null;
}

/** Why it is refused, in the words of the sheet; empty if it can go up. */
export function uploadProblem(file: FileFacts): string {
  if (!flyerFileKind(file)) return "Formatos permitidos: PDF, PNG, JPG o HTML.";
  if ((file.size ?? 0) > LARGEST_FILE) return "El archivo supera los 25 MB.";
  return "";
}

/**
 * A new flyer is always a new name (invariant 4): the time and the option it was uploaded for. That
 * is why only these can be kept by the browsers for a year.
 */
export function newFlyerImage(stamp: number, option: number): `flyer_${number}_op${number}.jpg` {
  return `flyer_${stamp}_op${option}.jpg`;
}

export function newHtmlFile(stamp: number): `index_${number}.html` {
  return `index_${stamp}.html`;
}

/** The address with its version: whoever enters after asks for it again, not what they kept. */
export function withVersion(url: string, stamp: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${String(stamp)}`;
}

/** What `_active<n>.json` says of the flyer of an option; null when it has none. */
export interface ActiveFlyer {
  readonly name: string;
  readonly imageUrl: string | null;
  readonly htmlUrl: string | null;
}

export interface UploadedFlyer {
  readonly name: string;
  readonly url: string;
  readonly isImage: boolean;
  readonly createdAt: string | null;
  readonly size: number | null;
}

export type ActiveFlyers = ReadonlyMap<number, ActiveFlyer | null>;

export function isImageName(name: string): boolean {
  return /\.(?:png|jpe?g)$/i.test(name);
}

export interface FileOptions {
  /** Where it is the active flyer. */
  readonly active: readonly number[];
  /**
   * Its option: where it is active or, if it is nowhere, the one it was uploaded for, which stays in
   * its name (`flyer_<time>_op<n>.jpg`). 0 for old files without it.
   */
  readonly home: number;
}

export function optionsOfFile(
  name: string,
  options: readonly number[],
  active: ActiveFlyers,
): FileOptions {
  const where = options.filter((option) => active.get(option)?.name === name);
  const fromName = Number(/_op(\d+)\.[a-z0-9]+$/i.exec(name)?.[1] ?? 0);
  const home = where[0] ?? (options.includes(fromName) ? fromName : 0);
  return { active: where, home };
}

/** The options with a flyer go first; those without one, at the end with how to remove them. */
export function splitByFlyer(
  options: readonly number[],
  active: ActiveFlyers,
): { readonly withFlyer: readonly number[]; readonly withoutFlyer: readonly number[] } {
  const hasFlyer = (option: number) => Boolean(active.get(option)?.imageUrl);
  return {
    withFlyer: options.filter(hasFlyer),
    withoutFlyer: options.filter((option) => !hasFlyer(option)),
  };
}

/** An HTML of the build is linked only if it lives in our bucket: never another address. */
export function safeHtmlUrl(url: string | null, home: string): string | null {
  return url?.startsWith(home) ? url : null;
}

export type VersionAction = "activate" | "activate-in" | "other-option" | "calibrate";

/** What a version offers besides Ver and Borrar, in order. */
export function versionActions(
  file: UploadedFlyer,
  { active, home }: FileOptions,
): VersionAction[] {
  const actions: VersionAction[] = [];
  if (home && active.length === 0) actions.push("activate");
  actions.push(home ? "other-option" : "activate-in");
  if (file.isImage) actions.push("calibrate");
  return actions;
}

/** "812 KB", as the list writes the size of a file. */
export function sizeText(size: number | null): string {
  return size ? `${String(Math.round(size / 1024))} KB` : "";
}

/** The calibrator opens on the one option the file is active in, or on its own: else, it asks. */
export function optionToCalibrate({ active, home }: FileOptions): number | null {
  if (active.length === 1) return active[0] ?? null;
  if (active.length === 0 && home) return home;
  return null;
}
