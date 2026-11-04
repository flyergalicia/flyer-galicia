export type PromotionsTab = "search" | "active";

export function isPromotionsTab(value: string): value is PromotionsTab {
  return value === "search" || value === "active";
}
