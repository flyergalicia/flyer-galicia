// The drafts kept in the browser, so that a blackout or a reload does not lose them. What cannot be
// written is said, and nothing here throws: without storage the drafts go on in memory.
import type { Cut } from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";

export const DRAFTS_MAX_SIZE = 2_000_000;
const VERSION = 1;

/** These keys are stored: they stay in Spanish. */
export interface StoredDraft {
  readonly id: string;
  readonly opcion: number;
  readonly nombre: string;
  readonly cambios: readonly PlacedChange[];
  readonly recortes: readonly Cut[];
  readonly legal: string | null;
  readonly subidos: Readonly<Record<string, string>>;
}

export function draftsKey(personId: string): string {
  return `fg_borradores_${personId || "anon"}`;
}

function isStoredList(value: unknown): value is { readonly lista: readonly StoredDraft[] } {
  return (
    typeof value === "object" && value !== null && "lista" in value && Array.isArray(value.lista)
  );
}

export function readStoredDrafts(key: string): readonly StoredDraft[] {
  try {
    const read: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return isStoredList(read) ? read.lista : [];
  } catch {
    return [];
  }
}

export function forgetStoredDrafts(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Without storage there is nothing to forget.
  }
}

function hasUploads({ subidos }: StoredDraft): boolean {
  return Object.keys(subidos).length > 0;
}

function textOf(drafts: readonly StoredDraft[], now: number): string {
  return JSON.stringify({ v: VERSION, fecha: now, lista: drafts });
}

function tryWriting(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export type DraftsSaved = "saved" | "without-uploads" | "no-room";

/** The heaviest thing is the uploaded logos: without room, they are what stays out. */
export function writeStoredDrafts(
  key: string,
  drafts: readonly StoredDraft[],
  now: number = Date.now(),
): DraftsSaved {
  const withUploads = textOf(drafts, now);
  const canLeaveThemOut = drafts.some(hasUploads);
  const withoutUploads = () =>
    textOf(
      drafts.map((draft) => ({ ...draft, subidos: {} })),
      now,
    );
  if (withUploads.length > DRAFTS_MAX_SIZE && canLeaveThemOut) {
    return tryWriting(key, withoutUploads()) ? "without-uploads" : "no-room";
  }
  if (tryWriting(key, withUploads)) return "saved";
  if (canLeaveThemOut && tryWriting(key, withoutUploads())) return "without-uploads";
  return "no-room";
}
