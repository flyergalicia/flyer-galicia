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
