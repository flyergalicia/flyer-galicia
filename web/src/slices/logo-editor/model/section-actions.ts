// Recortar and Insertar. Both are steps of the list of cuts of the flyer on screen, which carries its
// picture and its calibration together: Deshacer, drafts and Estudio take them as they come.
import { hasNoAmounts } from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";
import {
  BAND_PROBLEM_TEXT,
  bandProblem,
  bestSeam,
  listAfterInsert,
  listAfterTrim,
  listOnWholeFlyer,
} from "./cuts.ts";
import type { CopiedSection, EditorCore, InsertSpot } from "./editor-state.ts";
import { gapNear, sectionThumbnail } from "./section-rows.ts";

const SPOT_REACH = 160;
const THUMBNAIL_WIDTH = 360;
export const LONG_NOTICE_MS = 7000;

export type SectionActions = ReturnType<typeof createSectionActions>;

function lostText(lost: number): string {
  if (!lost) return "";
  const what = lost === 1 ? " cambio de logo quedaba" : " cambios de logos quedaban";
  return ` ${String(lost)}${what} adentro y se sacaron.`;
}

export function createSectionActions(core: EditorCore, afterFirstChange: () => void) {
  const { workspace, notify } = core;

  /** The changes go with the picture, except those of another flyer, which are left alone. */
  const finishCut = (list: readonly PlacedChange[], hadChanges: boolean) => {
    const letGo = { selected: -1, group: [] };
    if (hadChanges || core.getState().list.length === 0) core.replaceList(list, letGo);
    else core.set(letGo);
    core.settleCut();
  };

  const takeOut = (y: number, h: number) => {
    const list = core.ownList();
    const { list: next, lost } = listAfterTrim(list, y, h);
    workspace.setCuts([...core.cuts(), { y, h }]);
    finishCut(next, list.length > 0);
    afterFirstChange();
    const { scene } = workspace.getState().slot;
    const noAmounts = scene && hasNoAmounts(scene) ? " y el flyer ya no lleva importes" : "";
    notify(`Listo: se quitó esa parte${noAmounts}.${lostText(lost)}`);
  };

  const spotAt = (clientY: number): InsertSpot | null => {
    const place = core.coordinates()?.toPicture(0, clientY);
    const art = core.picture();
    if (!place || !art) {
      core.set({ insertLine: null });
      return null;
    }
    const gap = gapNear(art, Math.max(0, Math.min(art.height, place.y)), SPOT_REACH);
    const spot = { y: gap.y, pad: Math.round(gap.g / 2) };
    core.set({ insertLine: spot });
    return spot;
  };

  const stopPlacing = () => {
    core.set({ mode: "none", insertLine: null, insertConfirm: null });
  };

  const putSection = (spot: InsertSpot) => {
    const { section } = core.getState();
    const art = core.picture();
    if (!section || !art) return;
    const { u, sy, sh, sw } = section;
    if (!workspace.sections.images().has(u)) {
      notify("La sección todavía se está bajando. Probá de nuevo en un momento.");
      void workspace.sections.fetch(u);
      return;
    }
    const y = Math.round(spot.y);
    const pad = Math.max(0, Math.round(spot.pad));
    const h = Math.max(1, Math.round((sh * art.width) / sw)) + 2 * pad;
    const list = core.ownList();
    workspace.setCuts([...core.cuts(), { y, h, ins: { u, sy, sh, sw, pad } }]);
    stopPlacing();
    finishCut(listAfterInsert(list, y, h), list.length > 0);
    afterFirstChange();
    notify("Listo: se insertó la sección y lo de abajo bajó. Si no quedó bien, Deshacer (Ctrl+Z).");
  };

  return {
    /** A band was dragged, in coordinates of the screen: it is shown and asked about. */
    trimDragged: (fromClientY: number, toClientY: number) => {
      const art = core.picture();
      const coordinates = core.coordinates();
      core.set({ mode: "none", trimBand: null });
      if (!art || !coordinates) return;
      const top = coordinates.toPicture(0, Math.min(fromClientY, toClientY));
      const bottom = coordinates.toPicture(0, Math.max(fromClientY, toClientY));
      if (!top || !bottom) {
        notify(BAND_PROBLEM_TEXT.officers);
        return;
      }
      const [y0, y1] = [Math.max(0, top.y), Math.min(art.height, bottom.y)];
      const problem = bandProblem(y0, y1, art.height);
      if (problem) {
        notify(BAND_PROBLEM_TEXT[problem]);
        return;
      }
      const { y, h } = bestSeam(art, Math.round(y0), Math.round(y1));
      core.set({ pendingTrim: { y, h, art: core.currentArt() } });
    },
    trimUntouched: () => {
      core.set({ trimBand: null });
      notify("Arrastrá de arriba hacia abajo sobre la parte que querés quitar.");
    },
    setTrimBand: (trimBand: { readonly y0: number; readonly y1: number } | null) => {
      core.set({ trimBand });
    },
    confirmTrim: () => {
      const { pendingTrim } = core.getState();
      core.set({ pendingTrim: null });
      if (pendingTrim?.art === core.currentArt()) takeOut(pendingTrim.y, pendingTrim.h);
    },
    cancelTrim: () => {
      core.set({ pendingTrim: null });
    },
    /** "Volver a como estaba": the whole flyer, and the logos go down to their place. */
    backToWhole: () => {
      const cuts = core.cuts();
      if (cuts.length === 0) return;
      const list = core.ownList();
      const next = listOnWholeFlyer(list, cuts);
      workspace.setCuts([]);
      finishCut(next, list.length > 0);
      notify("El flyer volvió a estar entero.");
    },
    /** Lets the crop go without touching the logos: another option, another draft. */
    forgetCuts: () => {
      if (core.cuts().length === 0) return;
      workspace.setCuts([]);
      const { mode } = core.getState();
      core.set({ pendingTrim: null, mode: mode === "trim" ? "none" : mode });
    },

    openSectionPicker: () => {
      core.set({ mode: "none", sectionPicker: true });
    },
    closeSectionPicker: () => {
      core.set({ sectionPicker: false });
    },
    /** I and the button: they open the window, and while placing they cancel. */
    toggleInsert: () => {
      if (core.getState().mode === "insert") stopPlacing();
      else core.set({ mode: "none", sectionPicker: true });
    },
    startPlacing: (section: CopiedSection) => {
      const picture = workspace.sections.images().get(section.u);
      core.set({
        mode: "insert",
        section,
        sectionPicker: false,
        sectionThumbnail: picture ? sectionThumbnail(picture, section, THUMBNAIL_WIDTH) : "",
        clean: false,
        selected: -1,
        group: [],
        places: [],
        insertLine: null,
        insertConfirm: null,
      });
    },
    hoverPlacing: (clientY: number) => {
      const { mode, insertConfirm } = core.getState();
      if (mode === "insert" && !insertConfirm) spotAt(clientY);
    },
    pressPlacing: (clientY: number, isFinger: boolean) => {
      const spot = spotAt(clientY);
      if (!spot) {
        notify("Ahí van los oficiales. Elegí un lugar un poco más arriba.");
        return;
      }
      if (isFinger) core.set({ insertConfirm: spot });
      else putSection(spot);
    },
    confirmPlacing: () => {
      const { insertConfirm } = core.getState();
      core.set({ insertConfirm: null });
      if (insertConfirm) putSection(insertConfirm);
    },
    otherPlace: () => {
      core.set({ insertConfirm: null });
    },
    stopPlacing,
  };
}
