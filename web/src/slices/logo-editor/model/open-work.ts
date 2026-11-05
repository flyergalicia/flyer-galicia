// A draft or a design open beside the flyers. A draft (`temp`) has no row in Estudio: it lives in this
// page and, in case of a blackout, in the browser.
import type { Cut } from "@/shared/flyer-engine/index.ts";
import type { StoredDesign } from "@/shared/lib/studio/design-desk.ts";
import { placedChanges, type PlacedChange } from "./change.ts";

export interface OpenWork {
  readonly id: string;
  readonly option: number;
  readonly name: string;
  readonly temp: boolean;
  /** It belongs to this person: Guardar en Estudio can save over it. */
  readonly mine: boolean;
  /** A copy the administrator sent: it can be opened without having its flyer. */
  readonly shared?: boolean | undefined;
  /** Its flyer changed since it was saved: on opening it, it is said once. */
  readonly warnChanged?: boolean | undefined;
  readonly status: string;
  readonly company: string;
  readonly changes: readonly PlacedChange[];
  readonly cuts: readonly Cut[];
  /** Its own legal text; null if it uses that of the option. */
  readonly legal: string | null;
  /** The logos uploaded from the PC, as pictures: they travel with it. */
  readonly uploads: Readonly<Record<string, string>>;
}

/** A design that is in Estudio, with what it had saved. */
export function designWork(design: StoredDesign, warnChanged: boolean): OpenWork {
  return {
    id: design.id,
    option: design.option,
    name: design.name,
    temp: false,
    mine: design.mine,
    shared: design.shared,
    warnChanged,
    status: design.status,
    company: design.company,
    changes: placedChanges(design.changes),
    cuts: design.cuts,
    legal: design.legal,
    uploads: design.uploads,
  };
}

const DRAFT_NAME = "Borrador ";

/** "Borrador 1", or the first number free on that flyer. */
export function freeDraftName(works: readonly OpenWork[], option: number): string {
  const taken = new Set(works.filter((work) => work.temp && work.option === option).map(nameOf));
  let number = 1;
  while (taken.has(`${DRAFT_NAME}${String(number)}`)) number += 1;
  return `${DRAFT_NAME}${String(number)}`;
}

function nameOf({ name }: OpenWork): string {
  return name;
}

export function blankDraft(id: string, option: number, name: string): OpenWork {
  return {
    id,
    option,
    name,
    temp: true,
    mine: false,
    shared: false,
    warnChanged: false,
    status: "borrador",
    company: "",
    changes: [],
    cuts: [],
    legal: null,
    uploads: {},
  };
}
