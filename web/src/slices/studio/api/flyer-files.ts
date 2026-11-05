// The files a publication touches in the bucket. Each list is read again right before saving it: what
// another one saved meanwhile is not stepped on, and a list that could not be read is not an empty one
// (invariant 24).
import { type FlyerOption, flyerOptionsInFile } from "@/shared/domain/flyer-options.ts";
import { saveFlyerList } from "@/shared/lib/app-config/flyer-list-store.ts";
import { DesignImageError } from "../model/design-image.ts";
import { mergePermissions, savedRolesIn } from "@/shared/session/index.ts";
import type { Bucket, BucketJsonFile } from "@/shared/supabase/index.ts";

const JSON_FILE = { contentType: "application/json" } as const;
const CONFIGS_FILE = "_flyer_cfgs.json";
const PERMISSIONS_FILE = "_facultades.json";
const OPTIONS_FILE = "_opciones.json";

function asJsonBlob(content: unknown): Blob {
  return new Blob([JSON.stringify(content)], { type: "application/json" });
}

/** The options as they are now. */
export async function readOptionsNow(bucket: Bucket): Promise<readonly FlyerOption[]> {
  const file = await bucket.readJson(OPTIONS_FILE);
  if (!file.ok && file.error.kind !== "not-found") {
    throw new DesignImageError("no se pudo leer la lista de flyers");
  }
  return flyerOptionsInFile(file.ok ? file.value : null);
}

export { saveFlyerList };

/** The legal text of an option; empty if it has none or it could not be read. */
export async function readLegalText(bucket: Bucket, file: BucketJsonFile): Promise<string> {
  const answer = await bucket.readJson(file);
  if (!answer.ok) return "";
  const text: unknown =
    typeof answer.value === "object" && answer.value !== null
      ? Reflect.get(answer.value, "text")
      : "";
  return typeof text === "string" ? text : "";
}

export interface ReservedOption {
  readonly option: number;
  readonly image: `flyer_${number}_op${number}.jpg`;
}

const MOST_TRIES = 6;

function isTaken(message: string, status: number | null): boolean {
  return status === 409 || /exist|duplicate|409/i.test(message);
}

/**
 * A number nobody has: uploading its file without stepping on anything. If it is taken (another
 * publication at the same time, or one left half way), the next one. So the flyer of an option that
 * exists is never rewritten. The names go by hand: asking `activeFile` for a number that is not on
 * the list yet would answer that of option 1 and step on it.
 */
export async function reserveOption(
  bucket: Bucket,
  first: number,
  stamp: number,
  activeContent: (image: `flyer_${number}_op${number}.jpg`) => unknown,
  tries = 1,
): Promise<ReservedOption> {
  const option = first;
  const image = `flyer_${stamp}_op${option}.jpg` as const;
  const answer = await bucket.upload(`_active${option}.json`, asJsonBlob(activeContent(image)), {
    ...JSON_FILE,
    upsert: false,
  });
  if (answer.ok) return { option, image };
  if (tries >= MOST_TRIES || !isTaken(answer.error.message, answer.error.status)) {
    throw new DesignImageError(answer.error.message);
  }
  return reserveOption(bucket, first + 1, stamp, activeContent, tries + 1);
}

/** The calibration goes with the name of the image, as Config → Flyers finds it. Failing is no stop. */
export async function saveFlyerCalibration(
  bucket: Bucket,
  image: string,
  calibration: unknown,
): Promise<void> {
  const file = await bucket.readJson(CONFIGS_FILE);
  const known = file.ok && typeof file.value === "object" && file.value !== null ? file.value : {};
  await bucket.upload(CONFIGS_FILE, asJsonBlob({ ...known, [image]: calibration }), {
    ...JSON_FILE,
    upsert: true,
  });
}

/** Whoever sees the flyer it comes from, sees the new one. It says whether it could be saved. */
export async function copyPermissions(
  bucket: Bucket,
  from: number,
  to: number,
  options: readonly FlyerOption[],
): Promise<boolean> {
  const file = await bucket.readJson(PERMISSIONS_FILE);
  if (!file.ok && file.error.kind !== "not-found") return false;
  const known = mergePermissions(
    savedRolesIn(file.ok ? file.value : null),
    options.map(({ n }) => n),
  );
  const roles = Object.fromEntries(
    Object.entries(known).map(([role, permissions]) => [
      role,
      { ...permissions, [`opcion_${to}`]: Boolean(permissions[`opcion_${from}`]) },
    ]),
  );
  const written = await bucket.upload(
    PERMISSIONS_FILE,
    asJsonBlob({ roles, updated_at: new Date().toISOString() }),
    { ...JSON_FILE, upsert: true },
  );
  return written.ok;
}
