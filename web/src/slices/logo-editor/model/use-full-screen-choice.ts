// "Elegir en pantalla completa": goes to Promociones → Activas with the filters of the window, and +
// chooses a brand there and comes back alone to the flyer to put it on its place.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  isSupermarket,
  type Promotion,
  promotionZone,
  supermarketIndexOf,
} from "@/shared/domain/promotions/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import {
  type PromotionCatalog,
  PROMOTION_CATALOG_QUERY_KEY,
  shownPromotions,
} from "@/shared/lib/promotions/catalog-query.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import {
  type PromotionFilterValues,
  usePromotionFiltersPort,
} from "@/shared/lib/promotions/promotion-filters.ts";
import { usePromotionPicker } from "@/shared/lib/promotions/promotion-picking.ts";
import { idsOfLocality } from "@/shared/lib/promotions/promotions-edge.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { rememberPickerFilters } from "./brand-picker.ts";
import type { BrandFilters } from "./brand-filter.ts";
import type { FlyerPlace } from "./change.ts";
import { useLogoEditorActions } from "./editor-context.ts";

export function useFullScreenChoice() {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const backend = useBackend();
  const queryClient = useQueryClient();
  const includeModo = useIncludeModo();
  const toast = useToast();
  const port = usePromotionFiltersPort();
  const { pickOneBrand } = usePromotionPicker();

  const put = useCallback(
    async (
      place: FlyerPlace,
      promotion: Promotion,
      filters: PromotionFilterValues,
      withDays: boolean,
    ) => {
      const { province, locality } = filters;
      const image = promotion.imagen ?? "";
      const art = editor.currentArt();
      try {
        const logo = await workspace.logos.fetch(image);
        if (editor.currentArt() !== art) return;
        if (!withDays || !isSupermarket(promotion)) {
          editor.placeLogo(place, image, promotion.titulo, logo);
          toast.show(`Listo: ${promotion.titulo} en este flyer.`);
          return;
        }
        const catalog = queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY);
        const ids = locality ? await idsOfLocality(backend, province, locality) : null;
        const days = supermarketIndexOf(shownPromotions(catalog, includeModo)).flyerDays(
          promotion,
          promotionZone(province, locality, ids),
        );
        editor.placeSupermarket(place, image, promotion.titulo, logo, days);
        toast.show(`Listo: ${promotion.titulo} con sus días de descuento (${days}).`);
      } catch {
        toast.show(
          `No se pudo bajar el logo de ${promotion.titulo}. Probá con otro o revisá la conexión.`,
        );
      }
    },
    [backend, editor, includeModo, queryClient, toast, workspace],
  );

  return useCallback(
    (place: FlyerPlace, filters: BrandFilters, withDays: boolean) => {
      const art = editor.currentArt();
      editor.closePicker();
      pickOneBrand({
        filters: {
          province: filters.province,
          locality: filters.locality,
          category: filters.category,
          hideOnline: filters.hideOnline,
          onePerBrand: filters.onePerBrand,
          onlyPercent: filters.onlyPercent,
        },
        onBack: (promotion) => {
          // The filters left in Activas come back to the window.
          const left = port.read();
          rememberPickerFilters(left);
          if (editor.currentArt() !== art) {
            toast.show(
              "Cambió el flyer mientras elegías: tocá de nuevo el logo que querés cambiar.",
            );
            return;
          }
          if (!promotion) {
            editor.reopen(place);
            return;
          }
          void put(place, promotion, left, withDays);
        },
      });
    },
    [editor, pickOneBrand, port, put, toast],
  );
}
