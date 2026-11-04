// Brings what an option needs to be on screen: its data, its legal text and its picture, asked
// together. A file that does not exist is a fact; one that could not be fetched is not (invariant
// 24), and only a fact is remembered: the rest is asked again.
import {
  type ArtworkFailure,
  type FlyerScene,
  loadFlyerArtwork,
  type RawCalibration,
} from "@/shared/flyer-engine/index.ts";
import type { Bucket } from "@/shared/supabase/index.ts";
import { activeFile, legalFile } from "./option-files.ts";

export interface LoadedOption {
  readonly scene: FlyerScene | null;
  readonly failure: ArtworkFailure | null;
  /** Null when the legal text could not be read. */
  readonly legal: string | null;
}

export type OptionLoader = (
  option: number,
  settings: { readonly singleCashback: boolean },
) => Promise<LoadedOption>;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function isCalibration(value: unknown): value is RawCalibration {
  return typeof value === "object" && value !== null;
}

async function readActive(bucket: Bucket, option: number) {
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

async function readLegal(bucket: Bucket, option: number) {
  const file = await bucket.readJson(legalFile(option));
  if (file.ok) {
    const text = field(file.value, "text");
    return { failed: false, text: typeof text === "string" ? text : "" };
  }
  return { failed: file.error.kind === "unreachable", text: "" };
}

/** Nothing here throws: what could not arrive is said in the answer. */
export function createOptionLoader(bucket: Bucket): OptionLoader {
  return async (option, { singleCashback }) => {
    const [active, legal] = await Promise.all([
      readActive(bucket, option),
      readLegal(bucket, option),
    ]);
    const legalText = legal.failed ? null : legal.text;
    if (active.failed || legal.failed) {
      return { scene: null, failure: "network", legal: legalText };
    }
    const artwork = await loadFlyerArtwork({
      imageUrl: active.imageUrl,
      calibration: active.calibration,
      singleCashback,
    });
    return artwork.ok
      ? { scene: artwork.value, failure: null, legal: legalText }
      : { scene: null, failure: artwork.error, legal: legalText };
  };
}
