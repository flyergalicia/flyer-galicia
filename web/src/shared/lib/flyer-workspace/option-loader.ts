// Brings what an option needs to be on screen: its data, its legal text and its picture, asked
// together. A file that does not exist is a fact; one that could not be fetched is not (invariant
// 24), and only a fact is remembered: the rest is asked again.
import {
  type ArtworkFailure,
  type FlyerScene,
  loadFlyerArtwork,
} from "@/shared/flyer-engine/index.ts";
import type { Bucket } from "@/shared/supabase/index.ts";
import { FIRST_OPTION_DEFAULT_LEGAL } from "./default-legal.ts";
import { readActive } from "./option-active.ts";
import { legalFile } from "./option-files.ts";

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

/** Saved empty on purpose is empty; never saved, option 1 keeps the text it always had. */
function neverSavedLegal(option: number): string {
  return option === 1 ? FIRST_OPTION_DEFAULT_LEGAL : "";
}

async function readLegal(bucket: Bucket, option: number) {
  const file = await bucket.readJson(legalFile(option));
  if (file.ok) {
    const text = field(file.value, "text");
    return { failed: false, text: typeof text === "string" ? text : neverSavedLegal(option) };
  }
  return { failed: file.error.kind === "unreachable", text: neverSavedLegal(option) };
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
