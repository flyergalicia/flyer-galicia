// What each step does to put its element in sight (`antes`): change of tab, open or close «Otros»,
// Individual / Masivo / Historial, Promociones, a solapa of Gestiones, the name menu. Each one goes the
// same way as its button, through the places each screen answers for: nothing is opened from inside.
import { type InnerTab } from "@/shared/domain/commercial-tabs.ts";
import type { EditorPanel } from "@/shared/domain/editor-panels.ts";
import { SEARCH_UNLESS_RESULTS } from "@/shared/domain/promotions/tabs.ts";
import { MENU_CLOSED, MENU_OPEN, type PlaceDesk } from "@/shared/lib/places/place-desk.ts";
import { commercialTabsOnPage, type PagePart } from "./targets.ts";

export type Prepare =
  | { readonly kind: "editor"; readonly tab: "flyer" | "rubros"; readonly panel: EditorPanel }
  | { readonly kind: "editor-others" }
  | { readonly kind: "menu" }
  | { readonly kind: "hunter"; readonly others: boolean }
  | { readonly kind: "promotions" }
  | { readonly kind: "commercial"; readonly tab: InnerTab | null };

export const TO_INDIVIDUAL: Prepare = { kind: "editor", tab: "flyer", panel: "individual" };
export const TO_BULK: Prepare = { kind: "editor", tab: "flyer", panel: "masivo" };
export const TO_HISTORY: Prepare = { kind: "editor", tab: "flyer", panel: "historial" };
export const TO_CATEGORY: Prepare = { kind: "editor", tab: "rubros", panel: "individual" };
export const TO_OTHERS: Prepare = { kind: "editor-others" };
export const TO_MENU: Prepare = { kind: "menu" };
export const TO_HUNTER: Prepare = { kind: "hunter", others: false };
export const TO_HUNTER_OTHERS: Prepare = { kind: "hunter", others: true };
export const TO_PROMOTIONS: Prepare = { kind: "promotions" };

export function toCommercial(tab: InnerTab | null): Prepare {
  return { kind: "commercial", tab };
}

/** What the tutorial needs from around it: the tabs of the shell and the places of each screen. */
export interface TourWays {
  readonly goToTab: (tabId: string) => void;
  readonly desk: PlaceDesk | null;
  /** What is on the page now: Gestiones has its solapas once its code came down. */
  readonly root?: PagePart;
}

function closeAround({ desk }: TourWays): void {
  desk?.ask("flyer-others", MENU_CLOSED);
  desk?.ask("user-menu", MENU_CLOSED);
}

function prepareEditor(ways: TourWays, tab: "flyer" | "rubros", panel: EditorPanel): void {
  closeAround(ways);
  ways.goToTab(tab);
  ways.desk?.ask("flyer-editor", panel);
}

function prepareOthers(ways: TourWays): void {
  ways.desk?.ask("user-menu", MENU_CLOSED);
  ways.goToTab("flyer");
  ways.desk?.ask("flyer-editor", "individual");
  ways.desk?.ask("flyer-others", MENU_OPEN);
}

/** `_tourAbrirMenu`: from the flyer editor (or one's own screen), with «Otros» closed. */
function prepareMenu(ways: TourWays): void {
  ways.goToTab("flyer");
  ways.desk?.ask("flyer-others", MENU_CLOSED);
  ways.desk?.ask("user-menu", MENU_OPEN);
}

function prepareHunter(ways: TourWays, others: boolean): void {
  ways.desk?.ask("user-menu", MENU_CLOSED);
  ways.goToTab("hunter");
  ways.desk?.ask("hunter-others", others ? MENU_OPEN : MENU_CLOSED);
}

/**
 * The steps are those of "Buscar". From "Activas" with no results it goes back to "Buscar"; with
 * results nothing is touched (changing the solapa empties the table), and the steps not seen skip.
 */
function preparePromotions(ways: TourWays): void {
  closeAround(ways);
  ways.goToTab("promos");
  ways.desk?.ask("promotions", SEARCH_UNLESS_RESULTS);
}

/** Its solapa only if Gestiones is already on the page: if not, the step shows on its header tab. */
function prepareCommercial(ways: TourWays, tab: InnerTab | null): void {
  closeAround(ways);
  ways.goToTab("gestiones");
  if (tab && commercialTabsOnPage(ways.root)) ways.desk?.ask("commercial-actions", tab);
}

export function prepareScreen(prepare: Prepare, ways: TourWays): void {
  switch (prepare.kind) {
    case "editor":
      prepareEditor(ways, prepare.tab, prepare.panel);
      return;
    case "editor-others":
      prepareOthers(ways);
      return;
    case "menu":
      prepareMenu(ways);
      return;
    case "hunter":
      prepareHunter(ways, prepare.others);
      return;
    case "promotions":
      preparePromotions(ways);
      return;
    default:
      prepareCommercial(ways, prepare.tab);
  }
}

/** On leaving, everything is as it was (`_tourEnd`): no menu open, and the main screen. */
export function leaveScreen(ways: TourWays): void {
  ways.desk?.ask("user-menu", MENU_CLOSED);
  ways.desk?.ask("flyer-others", MENU_CLOSED);
  ways.goToTab("flyer");
  ways.desk?.ask("flyer-editor", "individual");
}
