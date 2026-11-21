// What an option publishes in its `_active` file. It weighs nothing: the start of the app asks it of
// every option to know which ones have a flyer, without bringing the engine that draws them.
import type { RawCalibration } from "@/shared/flyer-engine/types.ts";
import type { Bucket } from "@/shared/supabase/index.ts";
import { activeFile } from "./option-files.ts";

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function isCalibration(value: unknown): value is RawCalibration {
  return typeof value === "object" && value !== null;
}

export async function readActive(bucket: Bucket, option: number) {
  const file = await bucket.readJson(activeFile(option));
  if (file.ok) {
    const imageUrl = field(file.value, "imageUrl");
    const calibration = field(file.value, "cfg");
    return {
      failed: false,
      imageUrl: typeof imageUrl === "string" && imageUrl ? imageUrl : null,
      calibration: isCalibration(calibration) ? calibration : null,
    };
  }
  return { failed: file.error.kind !== "not-found", imageUrl: null, calibration: null };
}

/**
 * Whether an option has a flyer, without bringing its picture. Null when it could not be asked: only
 * a firm answer can be written down (invariant 24).
 */
export async function optionHasFlyer(bucket: Bucket, option: number): Promise<boolean | null> {
  const { failed, imageUrl } = await readActive(bucket, option);
  return failed ? null : imageUrl !== null;
}
