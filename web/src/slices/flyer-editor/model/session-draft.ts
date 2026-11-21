// The flyer half made, in the browser of the person, with the faculty "Guardar historial y borrador".
// It has the shape of an item of the history, plus the name of the file.
import type { FlyerValues } from "@/shared/flyer-engine/index.ts";
import type { StoredFlyer } from "./stored-flyer.ts";

export interface SessionDraft extends StoredFlyer {
  readonly filename: string;
  readonly filenameManual: boolean;
  readonly ts: number;
}

export function draftKey(personId: string): string {
  return `fg_draft_${personId}`;
}

/** The legal text travels only if it is an edit of its own: an old draft does not step on a new one. */
export function draftValues(values: FlyerValues, savedLegal: string | undefined): FlyerValues {
  if (savedLegal !== undefined && values.legal !== savedLegal) return values;
  const { legal: _legal, ...rest } = values;
  return rest;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** With nothing of its own, there is nothing to offer. */
export function isWorthOffering({ v: values }: Pick<SessionDraft, "v">): boolean {
  return (
    hasText(values.empresa) ||
    typeof values.legal === "string" ||
    [
      values.nombre2,
      values.nombre3,
      values.nombre4,
      values.benefNombre,
      values.sedesTit,
      values.nombre5,
      values.nombre6,
      values.nombre7,
      values.nombre8,
    ].some(hasText)
  );
}

function isDraft(value: unknown): value is SessionDraft {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "v") === "object";
}

export function readDraft(key: string): SessionDraft | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return isDraft(stored) && isWorthOffering(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: SessionDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // The browser has no room: there is simply no draft.
  }
}

export function forgetDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to forget if the storage is closed.
  }
}

/** What says it did not change: there is no need to write it again. */
export function draftSignature({ v, ac, opt, filename }: SessionDraft): string {
  return JSON.stringify([v, ac, opt, filename]);
}
