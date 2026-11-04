// Deshacer and Rehacer inside the window of a strip. Each step is a copy of the selection (brands,
// order, sizes), the columns and the size of all. Like on the flyer, no step is marked by hand.
import type { StripPick } from "./strip-types.ts";

const MAX_STEPS = 60;

export interface StripPhoto {
  readonly selection: readonly StripPick[];
  readonly perRow: number;
  readonly sizeOfAll: number;
}

export interface StripHistory {
  readonly steps: readonly string[];
  readonly index: number;
}

export function photoOfStrip({ selection, perRow, sizeOfAll }: StripPhoto): string {
  return JSON.stringify({ sel: selection, cols: perRow, kt: sizeOfAll });
}

function isPhoto(read: unknown): read is { sel: StripPick[]; cols: number; kt: number } {
  return typeof read === "object" && read !== null && "sel" in read && Array.isArray(read.sel);
}

export function photoRead(photo: string): StripPhoto {
  const read: unknown = JSON.parse(photo);
  if (!isPhoto(read)) return { selection: [], perRow: 0, sizeOfAll: 1 };
  return { selection: read.sel, perRow: read.cols, sizeOfAll: read.kt };
}

export function startStripHistory(photo: string): StripHistory {
  return { steps: [photo], index: 0 };
}

/** A step more if something changed, and what could be redone goes away. */
export function noteStripStep(history: StripHistory, photo: string): StripHistory {
  if (history.steps[history.index] === photo) return history;
  const steps = [...history.steps.slice(0, history.index + 1), photo];
  const kept = steps.length > MAX_STEPS ? steps.slice(1) : steps;
  return { steps: kept, index: kept.length - 1 };
}

export function canGoBy({ steps, index }: StripHistory, by: -1 | 1): boolean {
  const next = index + by;
  return next >= 0 && next < steps.length;
}
