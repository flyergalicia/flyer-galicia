// Test support: what a test holds of the editor on screen.
import type { PromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import type { useSessionActions } from "@/shared/session/index.ts";
import type { LogoEditor } from "../model/editor-store.ts";

export const handles: {
  editor: LogoEditor | null;
  filters: PromotionFiltersPort | null;
  session: ReturnType<typeof useSessionActions> | null;
} = {
  editor: null,
  filters: null,
  session: null,
};
