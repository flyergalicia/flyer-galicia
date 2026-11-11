// The panel has three pillars, each with its sheets, and each pillar remembers the last sheet seen:
// `_AP_GROUPS` and `_apLast`. Parts 2 and 3 fill the sheets of Config without touching this.
import {
  isSheet,
  type Pillar,
  PILLARS,
  pillarOf,
  type SheetId,
} from "@/shared/domain/admin-sheets.ts";

export {
  isSheet,
  type Pillar,
  PILLARS,
  pillarOf,
  type SheetId,
  SHEETS,
} from "@/shared/domain/admin-sheets.ts";

export interface PanelPlace {
  readonly sheet: SheetId;
  readonly last: Readonly<Record<Pillar, SheetId>>;
}

export const FIRST_PLACE: PanelPlace = {
  sheet: "dashboard",
  last: { admin: "dashboard", data: "varios", config: "subir" },
};

/** A sheet chosen: it is also the last one seen of its pillar. Something else changes nothing. */
export function goToSheet(place: PanelPlace, sheet: string): PanelPlace {
  if (!isSheet(sheet)) return place;
  return { sheet, last: { ...place.last, [pillarOf(sheet)]: sheet } };
}

/** A pillar chosen: it opens on the last sheet seen of it. */
export function goToPillar(place: PanelPlace, pillar: string): PanelPlace {
  const known = PILLARS.find(([id]) => id === pillar);
  return known ? goToSheet(place, place.last[known[0]]) : place;
}

/** The panel opens where it was left, as long as the page lives: it is hidden, not gone. */
let lastPlace: PanelPlace = FIRST_PLACE;

export function rememberedPlace(): PanelPlace {
  return lastPlace;
}

export function rememberPlace(place: PanelPlace): void {
  lastPlace = place;
}
