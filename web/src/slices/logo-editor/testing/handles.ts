// Test support: what a test holds of the editor on screen.
import type { PromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import type { LogoEditor } from "../model/editor-store.ts";

export const handles: { editor: LogoEditor | null; filters: PromotionFiltersPort | null } = {
  editor: null,
  filters: null,
};
