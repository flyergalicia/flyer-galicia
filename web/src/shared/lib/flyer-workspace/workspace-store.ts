// The small store of the flyer editor: which option is on screen, what is drawn on it and at what
// size. Everything that changes many times a second goes through here, out of the state of React:
// the canvas subscribes to it without a render (see "Manejo de estado" in the plan).
import {
  createLogoLibrary,
  cropSceneWith,
  type Cut,
  downloadBlock,
  EMPTY_FLYER_SLOT,
  type FlyerFrame,
  type FlyerPreview,
  type FlyerScene,
  type FlyerSlot,
  flyerSlotReducer,
  type FlyerValues,
  type LogoChange,
  type LogoLibrary,
  readyScene,
  renderFullResolution,
  storedCropOf,
} from "@/shared/flyer-engine/index.ts";
import { type BatchLock, createBatchLock } from "./batch-lock.ts";
import type { LoadedOption, OptionLoader } from "./option-loader.ts";
import { createSectionLibrary, type SectionLibrary } from "./section-library.ts";

export const ZOOM_MAX = 1.3;
export const ZOOM_MIN = 0.2;
export const ZOOM_STEP = 1.25;
const SCALE_MAX = 0.55;
const SCALE_MIN_WIDTH = 200;

export interface WorkspaceState {
  readonly slot: FlyerSlot;
  /** What the form says, without the changes of the logos. */
  readonly form: FlyerValues;
  /** The legal text of the option on screen; empty while it is on its way. */
  readonly legal: string;
  readonly logos: readonly LogoChange[];
  /** The picture those changes were made on. */
  readonly logosArt: string;
  readonly zoom: number;
  /** Pixels of canvas per pixel of flyer. */
  readonly scale: number;
  /** How much the flyer grew the last time it was drawn, to fit more officers. */
  readonly extra: number;
  /** One more every time it is drawn: what is over the flyer follows it. */
  readonly draws: number;
}

export interface FlyerWorkspace {
  readonly logos: LogoLibrary;
  readonly sections: SectionLibrary;
  /** A batch running: meanwhile the flyer is not changed by hand. */
  readonly batch: BatchLock;
  readonly getState: () => WorkspaceState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Goes to an option. What it returns says when what was asked for arrived or failed. */
  readonly selectOption: (option: number, singleCashback: boolean) => Promise<LoadedOption>;
  readonly retryLoading: (singleCashback: boolean) => Promise<LoadedOption | null>;
  readonly setForm: (form: FlyerValues) => void;
  readonly setLogoChanges: (changes: readonly LogoChange[], art: string) => void;
  /**
   * The flyer on screen with those cuts, counted from the whole one: the picture and its calibration
   * change together (invariant 22). No cuts: the whole flyer. A section not in memory leaves a gap
   * (invariant 27): whoever opens something stored brings them first with `sections.bring`.
   */
  readonly setCuts: (cuts: readonly Cut[]) => void;
  /** The legal text on screen: what the person writes, or what a draft or a design has. */
  readonly setLegal: (text: string) => void;
  /** The legal text of the option on screen: what was edited in this session, or the saved one. */
  readonly optionLegal: () => string;
  /** What the option on screen has saved, with no edits; undefined if it is not known. */
  readonly savedLegal: () => string | undefined;
  /** The option has a flyer; undefined while nobody knows. */
  readonly hasFlyer: (option: number) => boolean | undefined;
  /** The scene of an option as it was loaded, whole; null if it is not known. */
  readonly optionScene: (option: number) => FlyerScene | null;
  /** Goes back to the saved legal text of the option. */
  readonly restoreForm: (form: FlyerValues) => void;
  readonly setZoom: (zoom: number) => void;
  /** The room the preview has: with it, the scale. */
  readonly fitToWidth: (room: number) => void;
  /** Draws on the canvas before returning (invariant 1). */
  readonly drawNow: () => void;
  readonly requestDraw: () => void;
  readonly attachPreview: (preview: FlyerPreview | null) => void;
  readonly noteDrawn: (extra: number) => void;
  /** What goes on the canvas now, or null if nothing can be shown. */
  readonly readFrame: () => FlyerFrame | null;
  /** What a download has: the same as on screen (invariant 16). */
  readonly currentValues: () => FlyerValues;
  /** The flyer at its real size, or null if this option cannot be downloaded (invariant 23). */
  readonly renderDownload: () => HTMLCanvasElement | null;
}

export interface WorkspaceOptions {
  readonly loadOption: OptionLoader;
  readonly fetchLogo: (key: string) => Promise<Blob>;
  readonly initialForm: FlyerValues;
  /** Which addresses a section can come from. */
  readonly isSectionAddress?: (address: string) => boolean;
}

const INITIAL_VIEW = {
  slot: EMPTY_FLYER_SLOT,
  legal: "",
  logos: [],
  logosArt: "",
  zoom: 1,
  scale: 0,
  extra: 0,
  draws: 0,
} satisfies Omit<WorkspaceState, "form">;

/** A fact stays; what could not arrive is asked again the next time. */
function isFirm({ scene, failure }: LoadedOption): boolean {
  return Boolean(scene) || failure === "no-flyer";
}

export function createFlyerWorkspace({
  loadOption,
  fetchLogo,
  initialForm,
  isSectionAddress = () => false,
}: WorkspaceOptions): FlyerWorkspace {
  let state: WorkspaceState = { ...INITIAL_VIEW, form: initialForm };
  let preview: FlyerPreview | null = null;
  let room = 0;
  const listeners = new Set<() => void>();
  const settled = new Map<number, LoadedOption>();
  const running = new Map<number, Promise<LoadedOption>>();
  /** What each option has saved, and what was edited of it in this session. */
  const savedLegals = new Map<number, string>();
  const editedLegals = new Map<number, string>();
  /** Whose legal text is on the field: nobody's while another one is on its way. */
  let legalOwner: number | null = null;

  const change = (next: Partial<WorkspaceState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const requestDraw = () => preview?.requestDraw();
  const drawNow = () => preview?.drawNow();

  const logos = createLogoLibrary({ fetchLogo, onArrival: requestDraw });
  const sections = createSectionLibrary({ isOurs: isSectionAddress });

  const scaleFor = (zoom: number, { scene }: FlyerSlot) => {
    if (!scene || room <= 0) return state.scale;
    const usable = Math.max(room, SCALE_MIN_WIDTH);
    return Math.min(SCALE_MAX, usable / scene.art.width) * zoom;
  };

  const legalOf = (option: number) => editedLegals.get(option) ?? savedLegals.get(option);

  /**
   * What is on the field stays with the option it belongs to, and only if it differs from the saved
   * one. Whose it is comes from the owner and not from the option on screen: with two clicks during
   * a load, the old legal text was kept as an edit of the new one.
   */
  const keepEditedLegal = () => {
    if (legalOwner === null) return;
    const saved = savedLegals.get(legalOwner);
    if (saved === undefined) return;
    if (state.legal === saved) editedLegals.delete(legalOwner);
    else editedLegals.set(legalOwner, state.legal);
  };

  const apply = (option: number, loaded: LoadedOption) => {
    const event = loaded.scene
      ? ({ type: "loaded", option, scene: loaded.scene } as const)
      : ({ type: "failed", option, reason: loaded.failure ?? "network" } as const);
    const slot = flyerSlotReducer(state.slot, event);
    // What arrives late for another option does not step on the one on screen (invariant 6).
    if (slot === state.slot) return;
    if (loaded.legal !== null) savedLegals.set(option, loaded.legal);
    legalOwner = option;
    change({
      slot,
      legal: legalOf(option) ?? "",
      scale: scaleFor(state.zoom, slot),
    });
    requestDraw();
  };

  const load = (option: number, singleCashback: boolean): Promise<LoadedOption> => {
    const known = settled.get(option);
    if (known) return Promise.resolve(known);
    const already = running.get(option);
    if (already) return already;
    const request = loadOption(option, { singleCashback }).then((loaded) => {
      running.delete(option);
      if (isFirm(loaded)) settled.set(option, loaded);
      return loaded;
    });
    running.set(option, request);
    return request;
  };

  const selectOption: FlyerWorkspace["selectOption"] = (option, singleCashback) => {
    keepEditedLegal();
    legalOwner = settled.has(option) ? option : null;
    change({
      slot: flyerSlotReducer(state.slot, { type: "selected", option }),
      legal: (legalOwner === null ? undefined : legalOf(option)) ?? "",
    });
    const loading = load(option, singleCashback);
    void loading.then((loaded) => {
      apply(option, loaded);
    });
    return loading;
  };

  const currentValues = (): FlyerValues => {
    const { form, legal, logos: changes, logosArt, slot } = state;
    const base: FlyerValues = { ...form, legal, ...(slot.scene ? storedCropOf(slot.scene) : {}) };
    // Those of another flyer do not travel with this one.
    if (changes.length === 0 || logosArt !== slot.scene?.artKey) return base;
    return { ...base, logos: [...changes], logosSrc: logosArt };
  };

  return {
    logos,
    sections,
    batch: createBatchLock(),
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectOption,
    retryLoading: async (singleCashback) => {
      const { option } = state.slot;
      if (option === null) return null;
      settled.delete(option);
      return selectOption(option, singleCashback);
    },
    setForm: (form) => {
      change({ form });
      requestDraw();
    },
    setLogoChanges: (changes, art) => {
      change({ logos: changes, logosArt: art });
    },
    setCuts: (cuts) => {
      const { scene } = state.slot;
      if (!scene) return;
      const cropped = cropSceneWith(scene, cuts, sections.images());
      change({ slot: flyerSlotReducer(state.slot, { type: "cut", scene: cropped.scene }) });
    },
    setLegal: (legal) => {
      change({ legal });
      requestDraw();
    },
    optionLegal: () => {
      const { option } = state.slot;
      return (option === null ? undefined : legalOf(option)) ?? "";
    },
    savedLegal: () => {
      const { option } = state.slot;
      return option === null ? undefined : savedLegals.get(option);
    },
    hasFlyer: (option) => {
      const known = settled.get(option);
      return known ? Boolean(known.scene) : undefined;
    },
    optionScene: (option) => settled.get(option)?.scene ?? null,
    restoreForm: (form) => {
      const { option } = state.slot;
      if (option !== null) editedLegals.delete(option);
      const saved = option === null ? undefined : savedLegals.get(option);
      change({ form, legal: saved ?? state.legal });
      requestDraw();
    },
    setZoom: (zoom) => {
      change({ zoom, scale: scaleFor(zoom, state.slot) });
    },
    fitToWidth: (width) => {
      room = width;
      change({ scale: scaleFor(state.zoom, state.slot) });
    },
    drawNow,
    requestDraw,
    attachPreview: (next) => {
      preview = next;
    },
    noteDrawn: (extra) => {
      change({ extra, draws: state.draws + 1 });
    },
    readFrame: () => {
      const { scene } = state.slot;
      if (!scene || state.scale <= 0) return null;
      return { scene, values: currentValues(), scale: state.scale };
    },
    currentValues,
    renderDownload: () => {
      const scene = readyScene(state.slot);
      return scene ? renderFullResolution(scene, currentValues(), logos) : null;
    },
  };
}

/** Why it cannot be downloaded or edited right now, in the words the person reads; "" if it can. */
export function blockReason(slot: FlyerSlot, label: string, isAdmin: boolean): string {
  switch (downloadBlock(slot)) {
    case "loading":
      return `Esperá un momento: todavía se está cargando «${label}».`;
    case "network":
      return `No se pudo cargar el flyer «${label}». Tocá «Reintentar» arriba del flyer.`;
    case "no-flyer":
      return isAdmin
        ? `«${label}» todavía no tiene flyer: subilo desde Config → Flyers.`
        : `«${label}» todavía no tiene flyer cargado. Avisale al administrador.`;
    case "not-loaded":
      return "Todavía no se cargó el flyer. Esperá un momento.";
    default:
      return "";
  }
}
