// The two solapas of Promociones. They live here, apart from the screen, because the search of
// screens offers them before the code of Promociones comes down.
export type PromotionsTab = "search" | "active";

export const PROMOTIONS_TABS: readonly (readonly [PromotionsTab, string])[] = [
  ["search", "Buscar"],
  ["active", "Activas"],
];

export function isPromotionsTab(value: string): value is PromotionsTab {
  return PROMOTIONS_TABS.some(([tab]) => tab === value);
}

/**
 * What the tutorial asks before its steps, that are those of "Buscar": from "Activas" with no results
 * it goes back to "Buscar"; with results nothing changes, because changing the solapa empties them.
 */
export const SEARCH_UNLESS_RESULTS = "search-unless-results";
