// What a test can read of Cambiar logos that cannot be seen on the screen: exact places, what is
// chosen, the steps of Deshacer. It only reads: see shared/lib/test-probe.ts.
import type { QueryClient } from "@tanstack/react-query";
import {
  baseBrand,
  brandGroupKey,
  isInProvince,
  isOnlinePromotion,
  type Promotion,
} from "@/shared/domain/promotions/index.ts";
import type { FlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import {
  type PromotionCatalog,
  PROMOTION_CATALOG_QUERY_KEY,
} from "@/shared/lib/promotions/catalog-query.ts";
import type { LogoEditor } from "./editor-store.ts";
import { detectLogo, hasFailed } from "./flyer-pixels.ts";
import { isBlankRow, rowsOf } from "./section-rows.ts";
import { detectStrip } from "./strip-detect.ts";
import { chosenOf } from "./strip-selection.ts";
import { splitDays } from "./supermarket-days.ts";

function stripFacts(editor: LogoEditor, catalog: readonly Promotion[], province: string) {
  const selection = editor.getState().strip?.getState().selection ?? [];
  const byLogo = new Map(catalog.map((promotion) => [promotion.imagen, promotion]));
  return selection.map(({ img, sug = false }) => {
    const promotion = byLogo.get(img);
    const sameLogo = catalog.filter(({ imagen }) => imagen === img);
    return {
      logo: img,
      suggested: sug,
      category: promotion?.subtitulo ?? "",
      brandKey: brandGroupKey(baseBrand(promotion?.titulo ?? ""), new Set()),
      promotionId: promotion?.id ?? 0,
      hasLocalPromotion: sameLogo.some(
        (one) => !isOnlinePromotion(one) && isInProvince(one, province),
      ),
      hasPromotionThereOrOnline: sameLogo.some(
        (one) => isInProvince(one, province) || isOnlinePromotion(one),
      ),
    };
  });
}

function topCategory(catalog: readonly Promotion[], province: string): string {
  const counts = new Map<string, number>();
  for (const promotion of catalog) {
    if (isInProvince(promotion, province)) {
      const category = promotion.subtitulo ?? "";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()].toSorted((one, other) => other[1] - one[1])[0]?.[0] ?? "";
}

function stripProbe(editor: LogoEditor) {
  const session = editor.getState().strip;
  if (!session) return null;
  const state = session.getState();
  return {
    resuming: Boolean(session.base),
    brands: state.selection.map(({ img, t, k = 1, dx = 0, dy = 0, sug = false }) => ({
      logo: img,
      title: t,
      size: k,
      moved: { x: dx, y: dy },
      suggested: sug,
    })),
    perRow: state.perRow,
    sizeOfAll: state.sizeOfAll,
    marked: state.marked,
    chosen: chosenOf(state),
    region: {
      x: session.rect.x,
      y: session.rect.y,
      width: session.rect.w,
      height: session.rect.h,
    },
    originalLogos: session.info.n,
    drawing: session.drawing(),
    isSettled: session.isSettled(),
  };
}

export function logoEditorProbe(
  editor: LogoEditor,
  workspace: FlyerWorkspace,
  queryClient: QueryClient,
) {
  const imageOf = (key: string) => {
    const art = editor.picture();
    return art ? workspace.logos.imageFor(key, art, editor.currentArt()) : null;
  };
  return {
    catalogSize: () =>
      queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY)?.all.length ?? 0,
    placed: () => editor.active(),
    all: () => editor.getState().list,
    selection: () => ({
      main: editor.getState().selected,
      chosen: editor.chosen(),
      flyerLogos: editor.getState().places.length,
    }),
    isSettled: () => editor.isSettled(),
    isDragging: () => editor.getState().dragging,
    isEditing: () => editor.getState().on,
    mode: () => editor.getState().mode,
    clean: () => editor.getState().clean,
    undoSteps: () => editor.getState().history.steps.map(({ label }) => label),
    openDesign: () => {
      const work = editor.works.activeWork();
      return work && !work.temp ? work.name : null;
    },
    pickerTarget: () => {
      const { picker } = editor.getState();
      return picker ? editor.indexOfPlace(picker.place) : -1;
    },
    strip: () => stripProbe(editor),
    /** The rows and logos of a box of the flyer, as Armar franja reads them. */
    detectStrip: (x: number, y: number, w: number, h: number) => {
      const art = editor.picture();
      if (!art) return null;
      const { n, filas, porFila } = detectStrip(art, x, y, w, h);
      return { logos: n, rows: filas.map((row) => row.n), perRow: porFila };
    },
    /** The rows of the catalog as they were read. */
    catalogRows: () =>
      queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY)?.galicia ?? [],
    /** What the catalog knows of a brand of the selection, in that province. */
    selectionFacts: (province: string) => {
      const all =
        queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY)?.all ?? [];
      return stripFacts(editor, all, province);
    },
    topCategoryIn: (province: string) => {
      const all =
        queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY)?.all ?? [];
      return topCategory(all, province);
    },
    cuts: () => editor.cuts(),
    section: () => editor.getState().section,
    sectionImage: (address: string) => workspace.sections.images().get(address) ?? null,
    /** That row is a gap between blocks, on the flyer of now, the whole one or what was copied. */
    isBlankRow: (where: "current" | "whole" | "section", row: number) => {
      const { scene } = workspace.getState().slot;
      const { section } = editor.getState();
      const pictures = {
        current: scene?.art,
        whole: scene?.whole.art,
        section: section ? workspace.sections.images().get(section.u) : undefined,
      };
      const picture = pictures[where];
      return picture ? isBlankRow(rowsOf(picture), row) : false;
    },
    missingSections: () => workspace.sections.missing(editor.cuts()),
    openWork: () => {
      const work = editor.works.activeWork();
      return work ? { id: work.id, name: work.name, isDraft: work.temp } : null;
    },
    isOpening: () => editor.works.isOpening(),
    draftsReviewed: () => editor.works.isReviewed(),
    draftsKey: () => editor.works.storageKey(),
    isPlacing: () => editor.getState().placement !== null,
    pictureScale: () => editor.coordinates()?.screenScale() ?? 0,
    toClient: (x: number, y: number) => editor.coordinates()?.toClient(x, y) ?? null,
    imageOf,
    /** Whether the logo at that point has printed days below it. */
    hasDaysBelow: (x: number, y: number) => {
      const art = editor.picture();
      const found = art && detectLogo(art, x, y);
      if (!art || !found || hasFailed(found)) return false;
      const { text } = splitDays(art, found);
      return Boolean(text) && (text?.y ?? 0) >= found.y + found.h;
    },
    /** A logo of the flyer as the editor finds it; null if there is none there. */
    detect: (x: number, y: number) => {
      const art = editor.picture();
      if (!art) return null;
      try {
        const found = detectLogo(art, x, y);
        return hasFailed(found) ? null : { x: found.x, y: found.y, w: found.w, h: found.h };
      } catch {
        return null;
      }
    },
  };
}

export type LogoEditorProbe = ReturnType<typeof logoEditorProbe>;
