// What the files of a flyer say beside its picture: its legal text and the calibration of each image
// (`_flyer_cfgs.json`, by the name of the image). Config → Flyer and Estudio read and write them.
import {
  type Bucket,
  type BucketJsonFile,
  type BucketReadFailure,
  failure,
  type Result,
  success,
} from "@/shared/supabase/index.ts";

const CONFIGS_FILE = "_flyer_cfgs.json";

export type FlyerCalibrations = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The legal text of an option; empty if it has none or it could not be read. */
export async function readLegalText(bucket: Bucket, file: BucketJsonFile): Promise<string> {
  const answer = await bucket.readJson(file);
  if (!answer.ok || !isRecord(answer.value)) return "";
  const text = answer.value.text;
  return typeof text === "string" ? text : "";
}

/** The calibration of every image. None saved yet is an empty map; one that could not be read is not. */
export async function readFlyerCalibrations(
  bucket: Bucket,
): Promise<Result<FlyerCalibrations, BucketReadFailure>> {
  const answer = await bucket.readJson(CONFIGS_FILE);
  if (answer.ok) return success(isRecord(answer.value) ? answer.value : {});
  return answer.error.kind === "not-found" ? success({}) : failure(answer.error);
}

/**
 * The calibration goes with the name of the image, as Config → Flyer finds it. The map is read right
 * before: what another one saved meanwhile stays, and a map that could not be read is not written
 * over with only this one (invariant 24).
 */
export async function saveFlyerCalibration(
  bucket: Bucket,
  image: string,
  calibration: unknown,
): Promise<Result<void, string>> {
  const known = await readFlyerCalibrations(bucket);
  if (!known.ok) return failure("no se pudieron leer las calibraciones guardadas");
  const written = await bucket.upload(
    CONFIGS_FILE,
    new Blob([JSON.stringify({ ...known.value, [image]: calibration })], {
      type: "application/json",
    }),
    { contentType: "application/json", upsert: true },
  );
  return written.ok ? success(undefined) : failure(written.error.message);
}
