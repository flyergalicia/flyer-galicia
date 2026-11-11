// Test support: the desk of places of the page, for a test to ask for a place as the search of
// screens does. `PlaceDeskReader` puts it here.
import type { PlaceDesk } from "../places/place-desk.ts";

let seen: PlaceDesk | null = null;

export function notePlaceDesk(desk: PlaceDesk | null): void {
  seen = desk;
}

export function placeDeskOnPage(): PlaceDesk {
  if (!seen) throw new Error("There is no desk of places on the page");
  return seen;
}
