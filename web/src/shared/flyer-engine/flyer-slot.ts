// Which flyer is on screen, and whether it can be downloaded. A pure transition, for the slices to
// hold wherever fits them: an option with no picture never touches the scene that is drawn, and it
// is the slice that puts the words to each reason (invariant 23).
import { type ArtworkFailure } from "./scene.ts";
import { type FlyerScene } from "./types.ts";

export type DownloadBlock = "loading" | ArtworkFailure | "not-loaded";

export interface FlyerSlot {
  /** The option on screen. */
  readonly option: number | null;
  readonly loading: boolean;
  /** The last picture that loaded: it may belong to another option, with `failure` set. */
  readonly scene: FlyerScene | null;
  readonly failure: ArtworkFailure | null;
}

export type FlyerSlotEvent =
  | { readonly type: "selected"; readonly option: number }
  | { readonly type: "loaded"; readonly option: number; readonly scene: FlyerScene }
  | { readonly type: "failed"; readonly option: number; readonly reason: ArtworkFailure }
  | { readonly type: "cut"; readonly scene: FlyerScene };

export const EMPTY_FLYER_SLOT: FlyerSlot = {
  option: null,
  loading: false,
  scene: null,
  failure: null,
};

export function flyerSlotReducer(slot: FlyerSlot, event: FlyerSlotEvent): FlyerSlot {
  if (event.type === "selected") {
    return { ...slot, option: event.option, loading: true, failure: null };
  }
  // The picture and its calibration change together, and only over the same whole flyer.
  if (event.type === "cut") {
    return slot.scene?.whole === event.scene.whole ? { ...slot, scene: event.scene } : slot;
  }
  // What arrives late for another option does not step on the one on screen (invariant 6).
  if (event.option !== slot.option) return slot;
  if (event.type === "loaded") {
    return { ...slot, loading: false, scene: event.scene, failure: null };
  }
  return { ...slot, loading: false, failure: event.reason };
}

/** Why it cannot be downloaded right now, or null if it can. */
export function downloadBlock(slot: FlyerSlot): DownloadBlock | null {
  if (slot.loading) return "loading";
  if (slot.failure) return slot.failure;
  return slot.scene ? null : "not-loaded";
}

/** The scene to draw and download, only if it is that of the option on screen. */
export function readyScene(slot: FlyerSlot): FlyerScene | null {
  return downloadBlock(slot) === null ? slot.scene : null;
}

/** That option is the one on screen, finished loading, and its picture is the one being drawn. */
export function isOptionReady(slot: FlyerSlot, option: number): boolean {
  return slot.option === option && readyScene(slot) !== null;
}
