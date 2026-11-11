// Cambiar logos: the list of changes, what is chosen, and everything that is done to them. It lives
// out of the state of React, like the canvas: a drag changes it on every move of the mouse, and each
// piece on screen reads only what it needs with useSyncExternalStore.
import { type FlyerArt, type LogoChange } from "@/shared/flyer-engine/index.ts";
import {
  aligned,
  type Alignment,
  centered,
  chosenIn,
  copyOf,
  deletedFrom,
  moved,
  resizedTo,
  sameSize,
  spread,
  withoutChosen,
} from "./arrange.ts";
import {
  boxOf,
  coverOf,
  type FlyerPlace,
  fromFlyerKey,
  indexOfPlace,
  isAdjustable,
  isUnderStrip,
  liftFromFlyer,
  percentOf,
  type PlacedChange,
  withChange,
} from "./change.ts";
import type { FlyerCoordinates } from "./coordinates.ts";
import type {
  EditorCore,
  EditorEnvironment,
  LogoEditorState,
  PickerRequest,
  SelectionBox,
  ZoneMode,
} from "./editor-state.ts";
import {
  destinationOf,
  detectLogo,
  type Detection,
  hasFailed,
  markedPlace,
} from "./flyer-pixels.ts";
import { type GuideLine, guidesFor, keyboardLines, type MovingLogo } from "./guides.ts";
import {
  canRedo,
  canUndo,
  cutsIn,
  emptyPhoto,
  listIn,
  noteStep,
  photoOf,
  startHistory,
} from "./history.ts";
import { createOpenWorks } from "./open-works.ts";
import { createPlacement } from "./placement-session.ts";
import { createSectionActions } from "./section-actions.ts";
import { detectStrip } from "./strip-detect.ts";
import { currentSelection, stripAt, type StripWhere, whereStripOpens } from "./strip-opening.ts";
import { type PendingStrip, type StripSession, stripSessionOn } from "./strip-session.ts";
import type { StripRect } from "./strip-types.ts";
import { daysLayout, type DaysSplit, evenDestination, splitDays } from "./supermarket-days.ts";
import { measured } from "./text-measure.ts";

const STEP_WAIT_MS = 450;
const TIP_MS = 7000;
const FLASH_MS = 1300;
const GUIDES_FADE_MS = 1000;
const PASTE_OFFSET = 16;
const SMALLEST_STRIP_WIDTH = 60;
const SMALLEST_STRIP_HEIGHT = 30;

export type { LogoEditorState, PickerRequest, ZoneMode } from "./editor-state.ts";

const INITIAL: LogoEditorState = {
  on: false,
  clean: false,
  tipGone: false,
  mode: "none",
  list: [],
  art: "",
  selected: -1,
  group: [],
  places: [],
  dragging: false,
  guides: [],
  flashing: new Set(),
  history: startHistory(emptyPhoto(), ""),
  picker: null,
  strip: null,
  box: null,
  trimBand: null,
  pendingTrim: null,
  sectionPicker: false,
  section: null,
  sectionThumbnail: "",
  insertLine: null,
  insertConfirm: null,
  works: [],
  activeWork: null,
  closingWork: null,
  recoverable: null,
  savedSets: null,
  savingDesign: false,
  placement: null,
};

interface Clipboard {
  readonly art: string;
  readonly items: readonly PlacedChange[];
  pasted: number;
}

export type LogoEditor = ReturnType<typeof createLogoEditor>;

export function createLogoEditor(env: EditorEnvironment) {
  const { workspace, notify } = env;
  let state = INITIAL;
  const listeners = new Set<() => void>();
  let stepTimer: ReturnType<typeof setTimeout> | undefined;
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  let guidesTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let previous: ReadonlySet<string> | null = null;
  const flashUntil = new Map<string, number>();
  let clipboard: Clipboard | null = null;
  let coordinates: FlyerCoordinates | null = null;
  /** What was chosen for a strip of another flyer: the next strip marked opens with it. */
  let pendingStrip: PendingStrip | null = null;

  const set = (next: Partial<LogoEditorState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const currentArt = () => workspace.getState().slot.scene?.artKey ?? "";
  const picture = (): FlyerArt | null => workspace.getState().slot.scene?.art ?? null;
  const cuts = () => workspace.getState().slot.scene?.cuts ?? [];
  /** The steps of Deshacer are of the whole picture: a crop does not start them over. */
  const historyKey = () => workspace.getState().slot.scene?.whole.artKey ?? "";
  const active = (): readonly PlacedChange[] => (state.art === currentArt() ? state.list : []);
  const chosen = () => chosenIn(active(), state.selected, state.group);

  /** What was on another flyer does not come to this one. */
  const ownList = () => (state.art === currentArt() ? state.list : []);

  const refreshFlashing = () => {
    const now = Date.now();
    const list = active();
    const keys = list.map((entry) => JSON.stringify(entry));
    if (previous && !state.dragging) {
      for (const key of keys) {
        if (!previous.has(key)) flashUntil.set(key, now + FLASH_MS);
      }
    }
    for (const [key, until] of flashUntil) {
      if (until <= now) flashUntil.delete(key);
    }
    previous = state.on ? new Set(keys) : null;
    const flashing = new Set<number>();
    for (const [index, key] of keys.entries()) {
      if ((flashUntil.get(key) ?? 0) > now) flashing.add(index);
    }
    clearTimeout(flashTimer);
    if (flashUntil.size > 0) {
      const soonest = Math.min(...flashUntil.values()) - now;
      flashTimer = setTimeout(refreshFlashing, Math.max(0, soonest) + 1);
    }
    set({ flashing });
  };

  const noteStepNow = () => {
    clearTimeout(stepTimer);
    stepTimer = undefined;
    set({ history: noteStep(state.history, photoOf(active(), cuts()), historyKey()) });
  };

  const noteStepSoon = () => {
    if (state.dragging) return; // It is written down on letting go.
    clearTimeout(stepTimer);
    stepTimer = setTimeout(noteStepNow, STEP_WAIT_MS);
  };

  const publish = () => {
    const list = active();
    const changes: readonly LogoChange[] = list;
    workspace.setLogoChanges(changes, state.art);
  };

  /** Everything that changes the list ends here: it draws at once, and it counts for Deshacer. */
  const settle = () => {
    publish();
    workspace.drawNow();
    refreshFlashing();
    noteStepSoon();
    works.afterChange();
  };

  /** A cut is a step at once, and it also moves what is under it on the screen. */
  const settleCut = () => {
    publish();
    workspace.drawNow();
    refreshFlashing();
    noteStepNow();
    if (works.activeWork()?.temp) works.saveSoon();
  };

  const settleSoon = () => {
    publish();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      settle();
    });
  };

  const startHistoryHere = () => {
    clearTimeout(stepTimer);
    stepTimer = undefined;
    set({ dragging: false, history: startHistory(photoOf(active(), cuts()), historyKey()) });
  };

  const showGuidesFor = (indexes: readonly number[]) => {
    clearTimeout(guidesTimer);
    const list = active();
    const moving: MovingLogo[] = indexes.flatMap((index) => {
      const entry = list[index];
      return isAdjustable(entry) ? [{ index, ...boxOf(entry) }] : [];
    });
    if (moving.length === 0 || !coordinates) return;
    const { lines } = guidesFor({
      list,
      moving,
      main: state.selected >= 0 ? state.selected : (moving[0]?.index ?? -1),
      dx: 0,
      dy: 0,
      screenScale: coordinates.screenScale(),
      flyerWidth: picture()?.width ?? 0,
    });
    set({ guides: keyboardLines(lines) });
    guidesTimer = setTimeout(() => {
      set({ guides: [] });
    }, GUIDES_FADE_MS);
  };

  const replaceList = (list: readonly PlacedChange[], next: Partial<LogoEditorState> = {}) => {
    set({ list, art: currentArt(), ...next });
  };

  const placeLogo = (
    place: FlyerPlace,
    image: string,
    title: string,
    logo: HTMLCanvasElement | null,
  ) => {
    const list = ownList();
    const change = coverOf(place, image, title);
    if (logo) {
      const { tx, ty, tw, th } = destinationOf(place, logo.width / logo.height);
      Object.assign(change, { tx, ty, tw, th, bw: tw, bh: th });
    }
    const { list: next, index } = withChange(list, indexOfPlace(active(), place), change);
    replaceList(next, { selected: logo ? index : -1 }); // It stays chosen: the bar shows up.
    settle();
  };

  const placeText = (
    place: FlyerPlace,
    content: { texto: string; color: string; peso: number; fs: number },
    previousText: PlacedChange | null,
  ) => {
    const base: PlacedChange = {
      tipo: "txt",
      texto: content.texto,
      color: content.color,
      peso: content.peso,
      fs: content.fs,
      bfs: content.fs,
      x: place.x - 4,
      y: place.y - 4,
      w: place.w + 8,
      h: place.h + 8,
      bg: place.bg,
      t: content.texto.replaceAll("\n", " "),
      ox: place.x,
      oy: place.y,
      ow: place.w,
      oh: place.h,
      vacio: Boolean(place.vacio),
    };
    const center = previousText
      ? undefined
      : { x: place.x + place.w / 2, y: place.y + place.h / 2 };
    const seed = previousText ? { ...base, ...boxOf(previousText) } : base;
    const change = measured(seed, center);
    const list = ownList();
    const at = previousText ? list.indexOf(previousText) : indexOfPlace(active(), place);
    const { list: next, index } = withChange(list, at, change);
    replaceList(next, { selected: index });
    settle();
    return index;
  };

  /**
   * The days under the logo: covers the old text whole and writes them with the letter of the
   * original, centered under the logo.
   */
  const placeDays = (
    art: FlyerArt,
    logoPlace: FlyerPlace,
    text: FlyerPlace | null,
    days: string,
    lines: DaysSplit["lines"],
  ) => {
    const center = logoPlace.x + logoPlace.w / 2;
    const layout = daysLayout({ art, logoPlace, text, days, lines, center });
    const index = placeText(layout.cover, layout.content, null);
    const placed = state.list[index];
    if (!placed) return;
    const { tw, th } = boxOf(placed);
    const shift = layout.splitFromLines && text ? (text.h - th) / 2 : 0;
    replaceList(state.list.with(index, { ...placed, tx: center - tw / 2, ty: layout.top + shift }));
  };

  /**
   * A brand of Promociones on a place; if it is a supermarket and the tick is on, its days too. A
   * supermarket with no days of discount loses the days that were printed. Returns which of them.
   */
  const placeSupermarket = (
    place: FlyerPlace,
    image: string,
    title: string,
    logo: HTMLCanvasElement,
    days: string,
  ): "dias" | "sinDias" | "" => {
    const art = picture();
    if (!art) return "";
    const { logo: logoPlace, text, lines } = splitDays(art, place);
    placeLogo(logoPlace, image, title, logo);
    const logoIndex = indexOfPlace(active(), logoPlace);
    const placedLogo = active()[logoIndex];
    if (placedLogo) {
      const box = evenDestination(
        art,
        logoPlace,
        logo.width / logo.height,
        text ? text.y - 4 : null,
      );
      replaceList(state.list.with(logoIndex, { ...placedLogo, ...box, bw: box.tw, bh: box.th }));
    }
    let result: "dias" | "sinDias" | "" = "";
    if (days) {
      placeDays(art, logoPlace, text, days, lines);
      result = "dias";
    } else if (text) {
      placeLogo(text, "", "", null);
      result = "sinDias";
    }
    if (logoIndex >= 0) set({ selected: logoIndex });
    settle();
    return result;
  };

  const openPlace = (place: FlyerPlace, extra: Omit<PickerRequest, "place"> = {}) => {
    set({ picker: { place, ...extra } });
  };

  const openDetected = (detection: Detection) => {
    if (hasFailed(detection)) {
      notify(
        detection.error === "grande"
          ? "Ahí no encontré un logo suelto. Arrastrá un recuadro alrededor del logo para marcarlo."
          : "Ahí no hay ningún logo. Tocá justo encima del logo que querés cambiar.",
      );
      return;
    }
    openPlace(detection);
  };

  const changeChosen = () => {
    const entry = active()[state.selected];
    const art = picture();
    if (!entry || !art) return;
    const asPlace: FlyerPlace = {
      x: entry.ox,
      y: entry.oy,
      w: entry.ow,
      h: entry.oh,
      bg: entry.bg,
      manual: true,
    };
    if (entry.tipo === "txt") {
      openPlace({ ...asPlace, vacio: Boolean(entry.vacio) }, { text: entry });
      return;
    }
    const found = detectLogo(art, entry.ox + entry.ow / 2, entry.oy + entry.oh / 2);
    const usable = !hasFailed(found) && indexOfPlace(active(), found) === state.selected;
    openPlace({ ...(usable ? found : asPlace), indice: state.selected });
  };

  const liftPlaces = () => {
    let list = ownList();
    const group = [...chosen()];
    for (const place of state.places) {
      const { list: next, index } = withChange(
        list,
        indexOfPlace(list, place),
        liftFromFlyer(place),
      );
      list = next;
      if (!group.includes(index)) group.push(index);
    }
    const selected = group.length > 0 && state.selected < 0 ? (group.at(-1) ?? -1) : state.selected;
    replaceList(list, { places: [], group, selected });
  };

  const emptyPlaces = () => {
    let list = ownList();
    for (const place of state.places) {
      const empty = coverOf(place, "", "");
      list = withChange(list, indexOfPlace(list, place), empty).list;
    }
    replaceList(list, { places: [] });
  };

  const deleteChosen = (quiet = false) => {
    const indexes = chosen();
    if (indexes.length === 0) return 0;
    replaceList(deletedFrom(active(), indexes), { selected: -1, group: [] });
    settle();
    if (!quiet) {
      notify(
        `${indexes.length === 1 ? "Borrado" : `Borrados: ${indexes.length}`}. Con Ctrl+Z lo recuperás.`,
      );
    }
    return indexes.length;
  };

  const deleteGroup = () => {
    const placesCount = state.places.length;
    emptyPlaces();
    const deleted = deleteChosen(true);
    if (!deleted) {
      set({ selected: -1, group: [] });
      settle();
    }
    const total = placesCount + deleted;
    notify(`${total === 1 ? "Borrado" : `Borrados: ${total}`}. Con Ctrl+Z lo recuperás.`);
  };

  const backToOriginal = () => {
    const indexes = chosen();
    if (indexes.length === 0) return;
    replaceList(withoutChosen(active(), indexes), { selected: -1, group: [] });
    settle();
    notify(
      `${indexes.length === 1 ? "Volvió al original" : `Volvieron al original: ${indexes.length}`}. Con Ctrl+Z lo recuperás.`,
    );
  };

  const applyStep = () => {
    const photo = state.history.steps[state.history.index]?.list ?? emptyPhoto();
    // First the cuts of that step: the list is in its coordinates.
    const wanted = cutsIn(photo);
    if (JSON.stringify(wanted) !== JSON.stringify(cuts())) workspace.setCuts(wanted);
    replaceList(listIn(photo), { selected: -1, group: [] });
    settle();
  };

  const undo = () => {
    noteStepNow(); // A change just made is written down first: if not, it would be skipped.
    const { history } = state;
    if (history.index <= 0) return;
    const label = history.steps[history.index]?.label ?? "";
    set({ history: { ...history, index: history.index - 1 } });
    applyStep();
    notify(`Deshecho: ${label}`);
  };

  const redo = () => {
    noteStepNow();
    const { history } = state;
    if (history.index >= history.steps.length - 1) return;
    set({ history: { ...history, index: history.index + 1 } });
    applyStep();
    notify(`Rehecho: ${history.steps[history.index + 1]?.label ?? ""}`);
  };

  const readStrip = (art: FlyerArt, where: StripWhere, list: readonly PlacedChange[]) => {
    if (where.kind === "too-small") return null;
    const { rect } = where;
    const read = detectStrip(art, rect.x, rect.y, rect.w, rect.h);
    if (where.kind === "new") {
      const info = { ...read, bg: rect.bg || read.bg };
      return { rect, info, base: null, art: currentArt(), selection: [] };
    }
    const { base } = where;
    const info = base.franjaInfo ?? read;
    return { rect, info, base, art: currentArt(), selection: currentSelection(list, base) };
  };

  /** A box of the flyer becomes a strip: a new one, or the built one it falls on. */
  const openStripOn = (marked: StripRect) => {
    const art = picture();
    if (!art) return;
    const list = active();
    const where = whereStripOpens(list, marked);
    if (where.kind === "too-small") {
      notify(
        "Ese recuadro cae casi todo sobre una franja que ya armaste. Marcá la zona nueva sin pisarla.",
      );
      return;
    }
    if (where.kind === "new" && where.trimmed) {
      notify("Ajusté el recuadro para no pisar la franja que ya armaste.");
    }
    try {
      const place = readStrip(art, where, list);
      if (!place) return;
      set({ strip: stripSessionOn(place, pendingStrip) });
      pendingStrip = null;
    } catch {
      notify("No se pudo leer el flyer.");
    }
  };

  const editStrip = (id: string | undefined) => {
    const base = active().find(({ franja, franjaBase }) => franjaBase && franja === id);
    if (!base) {
      notify("No encontré esa franja en este flyer.");
      return;
    }
    setOnIfNeeded();
    set({ mode: "none" });
    openStripOn({ x: base.ox, y: base.oy, w: base.ow, h: base.oh, bg: base.bg, corta: false });
  };

  const core: EditorCore = {
    workspace,
    notify,
    getState: () => state,
    set,
    active,
    ownList,
    currentArt,
    picture,
    cuts,
    coordinates: () => coordinates,
    replaceList,
    publish,
    settle,
    settleCut,
    noteStepNow,
    startHistoryHere,
    setOn: (on) => {
      setOn(on);
    },
  };
  const sections = createSectionActions(core, () => {
    works.autoDraft();
  });
  const works = createOpenWorks(core, sections, env);
  const placement = createPlacement(core, works, env, {
    placeLogo,
    placeText,
    placeSupermarket,
    moveFromFlyer: (place: FlyerPlace) => {
      moveFromFlyer(place);
    },
    putStrip: (list: readonly PlacedChange[]) => {
      replaceList(list, { selected: -1, group: [] });
      settle();
    },
    letAllGo: () => {
      set({ selected: -1, group: [], places: [] });
    },
    openPlaceless: () => {
      if (!state.on) setOn(true);
      pendingStrip = null;
      set({
        mode: "none",
        clean: false,
        selected: -1,
        group: [],
        places: [],
        sectionPicker: false,
      });
    },
  });

  const moveFromFlyer = (place: FlyerPlace) => {
    const key = fromFlyerKey(place);
    const art = picture();
    if (!art || !workspace.logos.imageFor(key, art, currentArt())) return;
    const { list, index } = withChange(
      ownList(),
      indexOfPlace(active(), place),
      liftFromFlyer(place),
    );
    replaceList(list, { selected: index });
    settle();
  };

  const setClean = (clean: boolean) => {
    set(clean ? { clean, selected: -1, mode: "none" } : { clean });
  };

  const setOn = (on: boolean) => {
    clearTimeout(tipTimer);
    set({ tipGone: false });
    if (on) {
      tipTimer = setTimeout(() => {
        set({ tipGone: true });
      }, TIP_MS);
    }
    if (on) {
      set({ on });
    } else {
      pendingStrip = null; // What was left chosen for a strip does not come back after "Listo".
      if (state.placement) placement.finish();
      set({
        on,
        clean: false,
        mode: "none",
        selected: -1,
        group: [],
        places: [],
        dragging: false,
        picker: null,
        trimBand: null,
        pendingTrim: null,
        sectionPicker: false,
        insertLine: null,
        insertConfirm: null,
      });
    }
    refreshFlashing();
  };

  const setOnIfNeeded = () => {
    if (!state.on) setOn(true);
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    active,
    chosen,
    picture,
    currentArt,
    attachCoordinates: (next: FlyerCoordinates | null) => {
      coordinates = next;
    },
    coordinates: () => coordinates,
    cuts,
    canUndo: () => canUndo(state.history, historyKey()),
    canRedo: () => canRedo(state.history, historyKey()),
    isSettled: () => !frame && stepTimer === undefined && !state.dragging,

    setOn,
    toggleOn: () => {
      setOn(!state.on);
    },
    setClean,
    toggleClean: () => {
      setClean(!state.clean);
    },
    toggleMode: (mode: ZoneMode) => {
      if (mode === "strip" && state.mode === "strip") pendingStrip = null; // "Cancelar franja".
      set({
        mode: state.mode === mode ? "none" : mode,
        ...(mode === "trim" && state.mode !== "trim" ? { selected: -1, group: [] } : {}),
        insertLine: null,
        insertConfirm: null,
      });
    },
    undo,
    redo,
    ...sections,
    works,
    placement,
    openSavedSets: () => {
      set({ savedSets: "list" });
    },
    saveSavedSet: () => {
      set({ savedSets: "save" });
    },
    closeSavedSets: () => {
      set({ savedSets: null });
    },
    workspaceOption: () => workspace.getState().slot.option ?? 1,
    profileHasOption: (option: number) => env.canUseOption?.(option) ?? true,
    goToStudioSources: () => {
      env.goToStudioSources?.();
    },
    openSaveDesign: () => {
      set({ savingDesign: true });
    },
    closeSaveDesign: () => {
      set({ savingDesign: false });
    },

    // Touching the flyer.
    openPoint: (x: number, y: number) => {
      const art = picture();
      if (!art) return;
      set({ selected: -1, places: [] });
      try {
        openDetected(detectLogo(art, x, y));
      } catch {
        notify("No se pudo leer el flyer para buscar el logo.");
      }
    },
    openBox: (x: number, y: number, w: number, h: number) => {
      const art = picture();
      const place = art && markedPlace(art, x, y, w, h);
      if (place) openPlace(place);
    },
    changeChosen,
    closePicker: () => {
      set({ picker: null });
    },
    reopen: (place: FlyerPlace) => {
      setOnIfNeeded();
      openPlace(place);
    },
    chooseOne: (index: number, keepGroup: boolean) => {
      set({ selected: index, ...(keepGroup ? {} : { group: [], places: [] }) });
    },
    toggleInGroup: (index: number) => {
      const group = chosen();
      const next = group.includes(index)
        ? group.filter((other) => other !== index)
        : [...group, index];
      set({ group: next, selected: next.at(-1) ?? -1 });
    },
    setGroupForDrag: (group: readonly number[]) => {
      set({ group });
    },
    letGo: () => {
      set({ selected: -1, group: [] });
    },
    letAllGo: () => {
      set({ selected: -1, group: [], places: [] });
    },
    togglePlaceAt: (x: number, y: number) => {
      const art = picture();
      if (!art) return;
      const found = detectLogo(art, x, y);
      if (hasFailed(found)) {
        notify("Ahí no encontré un logo para sumar.");
        return;
      }
      if (state.art !== currentArt()) set({ list: [], art: currentArt() });
      const index = indexOfPlace(active(), found);
      if (isAdjustable(active()[index])) {
        const group = chosen();
        const next = group.includes(index)
          ? group.filter((other) => other !== index)
          : [...group, index];
        set({ group: next, selected: next.at(-1) ?? -1 });
        settle();
        return;
      }
      const [cx, cy] = [found.x + found.w / 2, found.y + found.h / 2];
      const at = state.places.findIndex(
        ({ x: left, y: top, w, h }) => cx >= left && cx <= left + w && cy >= top && cy <= top + h,
      );
      const places = at >= 0 ? state.places.toSpliced(at, 1) : [...state.places, found];
      const keep =
        state.selected >= 0 && state.group.length === 0 && isAdjustable(active()[state.selected]);
      set({ places, ...(keep ? { group: [state.selected] } : {}) });
    },
    chooseAllIn: (x0: number, y0: number, x1: number, y1: number) => {
      const group = [...chosen()];
      for (const [index, entry] of active().entries()) {
        const { tx, ty, tw, th } = boxOf(entry);
        const touches = tx < x1 && tx + tw > x0 && ty < y1 && ty + th > y0;
        if (isAdjustable(entry) && touches && !group.includes(index)) group.push(index);
      }
      if (group.length === 0) {
        notify("Ahí no hay logos cambiados para elegir.");
        return;
      }
      set({ group, selected: group.at(-1) ?? -1 });
      settle();
    },
    liftPlaces,
    setBox: (box: SelectionBox | null) => {
      set({ box });
    },

    // Dragging.
    startDrag: () => {
      set({ dragging: true });
    },
    dragTo: (moving: readonly MovingLogo[], dx: number, dy: number) => {
      let list = active();
      for (const { index, tx, ty } of moving) {
        const entry = list[index];
        if (entry) list = list.with(index, { ...entry, tx: tx + dx, ty: ty + dy });
      }
      replaceList(list);
      settleSoon();
    },
    showGuides: (guides: readonly GuideLine[]) => {
      set({ guides });
    },
    endDrag: () => {
      if (state.dragging) set({ dragging: false });
      noteStepSoon();
    },
    settle,

    // The bar of adjusting.
    nudge: (dx: number, dy: number) => {
      const indexes = chosen();
      if (indexes.length === 0) return;
      replaceList(moved(active(), indexes, dx, dy));
      settleSoon();
      showGuidesFor(indexes);
    },
    resizeChosen: (percent: number) => {
      replaceList(resizedTo(active(), chosen(), state.selected, percent));
      settleSoon();
    },
    resizeBy: (step: number) => {
      const entry = active()[state.selected];
      if (!isAdjustable(entry)) return;
      replaceList(resizedTo(active(), chosen(), state.selected, percentOf(entry) + step));
      settleSoon();
    },
    center: () => {
      replaceList(centered(active(), chosen()));
      settle();
    },
    align: (mode: Alignment) => {
      replaceList(aligned(active(), chosen(), state.selected, mode));
      settle();
    },
    spreadChosen: () => {
      replaceList(spread(active(), chosen()));
      settle();
    },
    sameSizeChosen: () => {
      replaceList(sameSize(active(), chosen(), state.selected));
      settle();
    },
    copyChosen: (quiet = false) => {
      const indexes = chosen();
      if (indexes.length === 0) return false;
      const list = active();
      clipboard = {
        art: currentArt(),
        items: indexes.flatMap((index) => list[index] ?? []),
        pasted: 0,
      };
      if (!quiet) {
        notify(
          indexes.length === 1
            ? "Copiado. Pegalo con Ctrl+V."
            : `Copiados ${indexes.length}. Pegalos con Ctrl+V.`,
        );
      }
      return true;
    },
    hasCopy: () => clipboard !== null,
    paste: () => {
      if (!clipboard || clipboard.items.length === 0) return;
      if (clipboard.art !== currentArt()) {
        notify("Lo copiado era de otro flyer.");
        return;
      }
      clipboard.pasted += 1;
      const offset = PASTE_OFFSET * clipboard.pasted;
      const list = ownList();
      const copies = clipboard.items.map((item) => copyOf(item, offset));
      const added = copies.map((_copy, index) => list.length + index);
      replaceList([...list, ...copies], {
        group: added.length > 1 ? added : [],
        selected: added.at(-1) ?? -1,
      });
      settle();
    },
    deleteChosen,
    deleteGroup,
    backToOriginal,
    groupOriginal: () => {
      set({ places: [] });
      backToOriginal();
    },
    openSeveral: (places: readonly FlyerPlace[]) => {
      const [first] = places;
      if (first) openPlace(first, { several: places });
    },

    // From the window of a logo.
    placeLogo,
    placeText,
    placeSupermarket,
    leftEmpty: (place: FlyerPlace) => {
      placeLogo(place, "", "", null);
    },
    moveFromFlyer,
    takeBack: (place: FlyerPlace) => {
      const at = indexOfPlace(active(), place);
      if (at >= 0) replaceList(state.list.toSpliced(at, 1), { selected: -1 });
      settle();
    },
    finishSeveral: () => {
      set({ places: [], group: [], selected: -1 });
      settle();
    },
    uploadedLogo: (place: FlyerPlace, key: string, title: string, logo: HTMLCanvasElement) => {
      workspace.logos.put(key, logo);
      placeLogo(place, key, title, logo);
    },
    isUnderStrip: (place: FlyerPlace) => isUnderStrip(active(), place),
    indexOfPlace: (place: FlyerPlace) => indexOfPlace(active(), place),

    // Armar franja.
    markedStrip: (x0: number, y0: number, x1: number, y1: number) => {
      set({ mode: "none" });
      const art = picture();
      const place = art && markedPlace(art, x0, y0, x1 - x0, y1 - y0);
      if (!place || place.w < SMALLEST_STRIP_WIDTH || place.h < SMALLEST_STRIP_HEIGHT) {
        notify("Ese recuadro es muy chico. Marcá toda la franja de logos.");
        return;
      }
      openStripOn(place);
    },
    /** A click while marking: on a strip already built it opens it. */
    touchedWhileMarking: (point: { readonly x: number; readonly y: number } | null) => {
      const base = point && stripAt(active(), point.x, point.y);
      if (base) {
        editStrip(base.franja);
        return;
      }
      notify(
        "Arrastrá un recuadro alrededor de TODA la franja de logos (o tocá una franja que ya armaste para editarla).",
      );
    },
    editStrip,
    /** The window goes away, and the strip goes on while choosing at full screen. */
    hideStrip: () => {
      set({ strip: null });
    },
    showStrip: (session: StripSession) => {
      setOnIfNeeded();
      set({ strip: session });
    },
    closeStrip: (session: StripSession) => {
      session.close();
      if (state.strip === session) set({ strip: null });
    },
    /** The flyer changed: the brands wait for a strip to be marked on this one. */
    keepForNewStrip: (pending: PendingStrip) => {
      pendingStrip = pending;
      setOnIfNeeded();
      set({ mode: "strip" });
    },
    putStrip: (list: readonly PlacedChange[]) => {
      replaceList(list, { selected: -1, group: [] });
      settle();
    },
    takeStripOut: (id: string) => {
      replaceList(
        ownList().filter(({ franja }) => franja !== id),
        { selected: -1, group: [] },
      );
      settle();
    },
    ownList,

    // From outside.
    /** Restaurar: the logos and the crop go, and a draft keeps what is its own in its tab. */
    forget: () => {
      works.backToOriginal();
      replaceList([], { selected: -1, group: [], places: [], activeWork: null });
      startHistoryHere();
      publish();
      workspace.drawNow();
      refreshFlashing();
    },
    backAllToOriginal: () => {
      replaceList([], { selected: -1 });
      settle();
      notify("Los logos volvieron a como vienen en el flyer.");
    },
  };
}
