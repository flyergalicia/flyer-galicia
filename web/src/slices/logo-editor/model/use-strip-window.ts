// What the window of a strip does on the flyer. A logo may take long to arrive: if meanwhile the
// window closed or the flyer changed, nothing falls on the new one with the places of the old one.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isSupermarket,
  type Promotion,
  provincesName,
  titleCase,
} from "@/shared/domain/promotions/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import { usePromotionPicker } from "@/shared/lib/promotions/promotion-picking.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { filterBrands, type BrandFilters } from "./brand-filter.ts";
import type { BrandPicker } from "./brand-picker.ts";
import { useLogoEditorActions } from "./editor-context.ts";
import { builtStrip } from "./strip-build.ts";
import { stripDays } from "./strip-days.ts";
import { STRIP_MAX } from "./strip-layout.ts";
import {
  indexOfLogo,
  isFull,
  withoutAt,
  withoutSuggested,
  withSuggested,
} from "./strip-selection.ts";
import type { StripSession } from "./strip-session.ts";
import { candidatesFor } from "./strip-suggest.ts";

const PLACES_WHEN_UNKNOWN = 8;

function logosWord(count: number): string {
  return `${String(count)}${count === 1 ? " logo" : " logos"}`;
}

function brandsWord(count: number): string {
  return `${String(count)}${count === 1 ? " marca" : " marcas"}`;
}

/** " de Supermercados en Neuquén": what was asked for. */
function ofWhat({ category, province, locality }: BrandFilters): string {
  const where = locality ? titleCase(locality) : province && provincesName(province);
  return `${category ? ` de ${category}` : ""}${where ? ` en ${where}` : ""}`;
}

/** What goes on the flyer for each logo: the first supermarket of the catalog with that logo. */
function useDaysOfLogo(picker: BrandPicker) {
  const { shown, supermarkets, zone } = picker;
  const supers = useMemo(() => {
    const byLogo = new Map<string, Promotion>();
    for (const promotion of shown) {
      const logo = promotion.imagen ?? "";
      if (logo && !byLogo.has(logo) && isSupermarket(promotion)) byLogo.set(logo, promotion);
    }
    return byLogo;
  }, [shown]);
  return useCallback(
    (logo: string) => {
      const promotion = supers.get(logo);
      return promotion ? supermarkets.flyerDays(promotion, zone) : "";
    },
    [supermarkets, supers, zone],
  );
}

export function useStripActions(session: StripSession, picker: BrandPicker) {
  const editor = useLogoEditorActions();
  const { logos } = useFlyerWorkspace();
  const toast = useToast();
  const port = usePromotionFiltersPort();
  const { pickManyBrands, stopPicking } = usePromotionPicker();
  const daysOf = useDaysOfLogo(picker);
  const [isSuggesting, setSuggesting] = useState(false);

  const close = useCallback(() => {
    editor.closeStrip(session);
  }, [editor, session]);

  // A new strip leaves behind the one that was being chosen on Activas.
  useEffect(() => {
    if (!session.hasComeBack()) stopPicking();
  }, [session, stopPicking]);

  // The logos already chosen are brought for the preview.
  useEffect(() => {
    for (const { img } of session.getState().selection) {
      logos.fetch(img).then(
        () => {
          if (session.isAlive()) session.logoArrived();
        },
        () => undefined,
      );
    }
  }, [logos, session]);

  const tickBrand = (promotion: Promotion) => {
    const { selection } = session.getState();
    const logo = promotion.imagen ?? "";
    const known = indexOfLogo(selection, logo);
    if (known >= 0) {
      session.change((choice) => withoutAt(choice, known));
      return;
    }
    if (isFull(selection)) {
      toast.show(`Hasta ${String(STRIP_MAX)} logos por franja.`);
      return;
    }
    session.change((choice) => ({
      ...choice,
      selection: [...choice.selection, { img: logo, t: promotion.titulo }],
    }));
    logos.fetch(logo).then(
      () => {
        if (session.isAlive()) session.logoArrived();
      },
      () => {
        if (!session.isAlive()) return;
        const at = indexOfLogo(session.getState().selection, logo);
        if (at >= 0) session.change((choice) => withoutAt(choice, at));
        toast.show(`No se pudo bajar el logo de ${promotion.titulo}.`);
      },
    );
  };

  const buildNow = (images: readonly HTMLCanvasElement[]) => {
    const art = editor.picture();
    if (!art) return;
    const { selection, perRow, sizeOfAll } = session.getState();
    const list = builtStrip(editor.ownList(), {
      id: session.id,
      rect: session.rect,
      info: session.info,
      selection,
      perRow,
      sizeOfAll,
      aspects: images.map(({ width, height }) => width / height),
      days: (places) =>
        stripDays({
          art,
          info: session.info,
          selection,
          places,
          withDays: picker.withDays,
          daysOf,
        }),
    });
    editor.putStrip(list);
    close();
    toast.show(
      `Listo: ${logosWord(selection.length)} en la franja. Para volver a editarla tocá «Editar franja» sobre el flyer.`,
    );
  };

  const put = async () => {
    const { selection, isPutting } = session.getState();
    if (isPutting) return;
    if (selection.length === 0) {
      toast.show("Tildá al menos una marca.");
      return;
    }
    session.setPutting(true);
    try {
      const images = await Promise.all(selection.map(({ img }) => logos.fetch(img)));
      // The window closed while they came down, and there is nothing to do.
      if (!session.isAlive()) return;
      if (editor.currentArt() === session.art) {
        buildNow(images);
      } else {
        close();
        toast.show(
          "Cambiaste de flyer mientras se armaba la franja, así que no se aplicó. Volvé a marcarla en este flyer.",
        );
      }
    } catch {
      session.setPutting(false);
      toast.show("No se pudieron bajar algunos logos. Revisá la conexión y probá de nuevo.");
    }
  };

  const addSuggested = async (candidates: readonly Promotion[], limit: number) => {
    setSuggesting(true);
    const brought = await Promise.all(
      candidates.map((promotion) =>
        logos.fetch(promotion.imagen ?? "").then(
          () => ({ img: promotion.imagen ?? "", t: promotion.titulo }),
          () => null,
        ),
      ),
    );
    setSuggesting(false);
    if (!session.isAlive()) return;
    // What is chosen NOW counts: some brand could have been ticked by hand meanwhile.
    const { selection, added } = withSuggested(session.getState().selection, brought, limit);
    session.change((choice) => ({ ...choice, selection }));
    const of = ofWhat(picker.filters);
    if (!added) toast.show("No se pudieron bajar los logos sugeridos. Probá de nuevo.");
    else if (selection.length < limit) {
      toast.show(
        `Con esos filtros encontré ${brandsWord(added)}${of}; los otros lugares quedan para que elijas vos.`,
      );
    } else toast.show(`Sugerimos ${brandsWord(added)}${of}. Quitá o reordená las que no van.`);
  };

  const suggest = () => {
    const places = session.info.n || PLACES_WHEN_UNKNOWN;
    const limit = Math.min(STRIP_MAX, places);
    const { selection } = session.getState();
    const missing = Math.max(0, limit - selection.length);
    if (missing === 0) {
      toast.show(
        `La franja ya tiene sus ${String(places)} lugares ocupados. Quitá alguna para que te sugiera otras.`,
      );
      return;
    }
    // It respects the chosen filters: with a zone chosen, those online are not added.
    const { filters, shown, supermarkets, zone, localityIds, isSearchingLocality } = picker;
    if (isSearchingLocality) {
      toast.show("Buscando las promos de la zona… en un momento sugiero.");
      return;
    }
    const { list } = filterBrands(
      shown,
      {
        ...filters,
        search: "",
        onePerBrand: true,
        hideOnline: filters.hideOnline || Boolean(filters.province || filters.locality),
      },
      localityIds,
      supermarkets,
      zone,
    );
    const free = list.filter(({ imagen }) => indexOfLogo(selection, imagen ?? "") < 0);
    const candidates = candidatesFor(free, missing, new Date());
    if (candidates.length === 0) {
      toast.show("No hay más marcas vigentes con esos filtros.");
      return;
    }
    void addSuggested(candidates, limit);
  };

  const removeSuggested = () => {
    const before = session.getState().selection.length;
    session.change(withoutSuggested);
    toast.show(`Se quitaron ${String(before - session.getState().selection.length)} sugeridas.`);
  };

  const restoreOriginal = () => {
    close();
    editor.takeStripOut(session.id);
    toast.show("La franja volvió a como viene en el flyer.");
  };

  const chooseAtFullScreen = () => {
    const { filters } = picker;
    editor.hideStrip();
    pickManyBrands({
      filters: {
        province: filters.province,
        locality: filters.locality,
        category: filters.category,
        hideOnline: filters.hideOnline,
        onePerBrand: filters.onePerBrand,
        onlyPercent: filters.onlyPercent,
      },
      picked: session.getState().selection.map(({ img, t }) => ({ logo: img, title: t })),
      limit: STRIP_MAX,
      limitNotice: `Hasta ${String(STRIP_MAX)} logos por franja.`,
      onAdd: ({ logo }) => {
        logos.fetch(logo).catch(() => undefined);
      },
      onCancel: () => {
        session.close();
      },
      onBack: (picked) => {
        // The filters left on Activas come back to the window.
        const left: BrandFilters = { ...port.read(), search: filters.search };
        session.comeBack(picked, left);
        if (editor.currentArt() === session.art) {
          editor.showStrip(session);
          return;
        }
        // Another flyer: the box of before is worth nothing, but what was chosen is not lost.
        const { selection, perRow } = session.getState();
        session.close();
        editor.keepForNewStrip({ selection, perRow, filters: left });
        toast.show(
          `Cambió el flyer mientras elegías. Marcá la franja en este flyer: tus ${String(selection.length)} marcas siguen elegidas.`,
        );
      },
    });
  };

  return {
    close,
    tickBrand,
    put,
    suggest,
    isSuggesting,
    removeSuggested,
    restoreOriginal,
    chooseAtFullScreen,
    daysOf,
  };
}

export type StripActions = ReturnType<typeof useStripActions>;
