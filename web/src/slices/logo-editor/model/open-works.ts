// The drafts and designs open beside the flyers. The first change on the original goes to a draft by
// itself: the original stays clean. They come and go with their own cuts, logos and legal text, and
// each opening has a number: only the last one can be applied (touching another tab before it finished
// loading used to leave the first one applied, and the download came out with it).
import { artFileName, type LogoChange } from "@/shared/flyer-engine/index.ts";
import type { LoadedOption } from "@/shared/lib/flyer-workspace/index.ts";
import type { StoredDesign } from "@/shared/lib/studio/design-desk.ts";
import { placedChanges } from "./change.ts";
import {
  draftsKey,
  forgetStoredDrafts,
  readStoredDrafts,
  type StoredDraft,
  writeStoredDrafts,
} from "./draft-storage.ts";
import type { EditorCore, EditorEnvironment } from "./editor-state.ts";
import { blankDraft, designWork, freeDraftName, type OpenWork } from "./open-work.ts";
import type { SectionActions } from "./section-actions.ts";
import { LONG_NOTICE_MS } from "./section-actions.ts";
import { missingUploads, missingUploadsText, restoreUploads, uploadsOf } from "./uploads.ts";

const SAVE_WAIT_MS = 1000;
const OFFER_WAIT_MS = 900;
const OPENING_GIVES_UP_MS = 15_000;

export type OpenWorks = ReturnType<typeof createOpenWorks>;

/** What a flyer of the history brings of its own. */
export interface StoredWork extends Pick<OpenWork, "option" | "cuts" | "legal"> {
  readonly logos: readonly LogoChange[];
}

function toStored(work: OpenWork): StoredDraft {
  return {
    id: work.id,
    opcion: work.option,
    nombre: work.name,
    cambios: work.changes,
    recortes: work.cuts,
    legal: work.legal,
    subidos: work.uploads,
  };
}

/** What Guardar en Estudio answered, with what it had on screen when it was pressed. */
export interface SavedDesign {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly status: string;
  readonly option: number;
  readonly changes: OpenWork["changes"];
  readonly uploads: OpenWork["uploads"];
  readonly cuts: OpenWork["cuts"];
  readonly legal: string;
}

/** A design that was saved on a flyer that is on screen: what is open becomes that design. */
function fromSaved({ id, name, company, status, option, ...content }: SavedDesign): OpenWork {
  return {
    id,
    option,
    name,
    company,
    status,
    temp: false,
    mine: true,
    shared: false,
    warnChanged: false,
    ...content,
  };
}

function lostUploadsText(lost: number): string {
  if (!lost) return "";
  return lost === 1
    ? " Ojo: 1 logo subido de la PC no se pudo guardar; volvé a subirlo."
    : ` Ojo: ${String(lost)} logos subidos de la PC no se pudieron guardar; volvé a subirlos.`;
}

export function createOpenWorks(
  core: EditorCore,
  sections: Pick<SectionActions, "forgetCuts">,
  env: EditorEnvironment,
) {
  const { workspace, notify } = core;
  const openedListeners = new Set<(work: OpenWork) => void>();
  const profileCan = env.canUseOption ?? (() => true);
  const isPreviewing = env.isPreviewingProfile ?? (() => false);
  /**
   * Sharing is permission for THAT design: the flyer under a copy can be used while it is open, even
   * if the profile does not have it. The preview of a profile shows what that profile sees.
   */
  const hasSharedOpen = (option: number) =>
    !isPreviewing() && core.getState().works.some((work) => work.shared && work.option === option);
  const canUse = (option: number) => profileCan(option) || hasSharedOpen(option);
  const personId = env.personId ?? (() => "");
  const selectOption =
    env.selectOption ??
    ((option: number): Promise<LoadedOption> => workspace.selectOption(option, false));
  const origins = new Map<string, string>();
  let sequence = 0;
  let turn = 0;
  /** An opening is under way: what it clears is not a change to move to a draft. */
  let isBusy = false;
  let isReviewed = false;
  let isOffered = false;
  let pending: readonly StoredDraft[] = [];
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let offerTimer: ReturnType<typeof setTimeout> | undefined;
  let warnedNoRoom = false;
  let warnedHeavy = false;

  const optionOnScreen = () => workspace.getState().slot.option;

  const find = (id: string | null) => core.getState().works.find((work) => work.id === id);

  /** The one on screen: its design is applied on its flyer. */
  const activeWork = () => {
    const work = find(core.getState().activeWork);
    return work && optionOnScreen() === work.option ? work : undefined;
  };

  const update = (id: string, next: Partial<OpenWork>) => {
    const { works } = core.getState();
    const at = works.findIndex((work) => work.id === id);
    const work = works[at];
    if (work) core.set({ works: works.with(at, { ...work, ...next }) });
  };

  /** Before leaving it: what was changed stays with it. */
  const keepActive = () => {
    const work = activeWork();
    if (!work) return;
    const art = core.picture();
    const { list, art: listArt, activeWork: id } = core.getState();
    const isOwn = listArt === core.currentArt();
    const uploads =
      work.temp && isOwn && art
        ? uploadsOf(list, work.uploads, workspace.logos, art, core.currentArt())
        : work.uploads;
    if (!id) return;
    update(id, {
      ...(isOwn ? { changes: list } : {}),
      cuts: core.cuts(),
      ...(typeof work.legal === "string" || work.temp ? { legal: workspace.getState().legal } : {}),
      uploads,
    });
  };

  const drafts = () => core.getState().works.filter(({ temp }) => temp);

  const saveNow = () => {
    keepActive();
    const list = [...drafts().map(toStored), ...pending];
    const key = draftsKey(personId());
    if (list.length === 0) {
      forgetStoredDrafts(key);
      return;
    }
    const saved = writeStoredDrafts(key, list);
    if (saved === "no-room" && !warnedNoRoom) {
      warnedNoRoom = true;
      notify(
        "No se pudieron guardar los borradores en esta PC (el navegador no tiene lugar). Siguen abiertos mientras no recargues la página; para conservarlos, guardalos en Estudio.",
        LONG_NOTICE_MS,
      );
    } else if (saved === "without-uploads" && !warnedHeavy) {
      warnedHeavy = true;
      notify(
        "Los borradores se guardaron en la PC sin los logos subidos (son muy pesados o no hay lugar). Para conservarlos, guardalos en Estudio.",
        LONG_NOTICE_MS,
      );
    }
  };

  /** What is offered back is on the table until it is answered: nothing steps on it. */
  const offer = () => {
    if (isReviewed) return;
    isReviewed = true;
    const key = draftsKey(personId());
    const usable = readStoredDrafts(key).filter((draft) => draft && canUse(draft.opcion));
    if (usable.length === 0) {
      forgetStoredDrafts(key);
      return;
    }
    pending = usable;
    core.set({ recoverable: usable });
  };

  const offerSoon = () => {
    if (isReviewed || isOffered) return;
    isOffered = true;
    offerTimer = setTimeout(offer, OFFER_WAIT_MS);
  };

  const saveSoon = () => {
    if (!isReviewed) {
      offerSoon();
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      saveNow();
    }, SAVE_WAIT_MS);
  };

  const create = (option: number, name?: string): OpenWork => {
    sequence += 1;
    const { works } = core.getState();
    const draft = blankDraft(
      `bor-${String(option)}-${String(sequence)}`,
      option,
      name ?? freeDraftName(works, option),
    );
    core.set({ works: [...works, draft] });
    return draft;
  };

  const autoDraft = (forced = false) => {
    const state = core.getState();
    const option = optionOnScreen();
    if ((!state.on && !forced) || activeWork() || isBusy || option === null) return;
    if (state.placement?.mode === "preview") return; // "Así queda": it moves on "Dejar así".
    if (core.active().length === 0 && core.cuts().length === 0) return;
    const draft = create(option);
    core.set({ activeWork: draft.id });
    saveSoon();
    notify(
      `Tus cambios quedaron en «${draft.name}», al lado del flyer original. El original no se tocó.`,
    );
  };

  const applyWork = (work: OpenWork) => {
    if (workspace.sections.missing(work.cuts) > 0) {
      const count = workspace.sections.missing(work.cuts);
      notify(
        `No se pudo bajar ${count === 1 ? "la sección insertada" : `${String(count)} secciones insertadas`}: en su lugar queda un espacio vacío. Revisá tu conexión y volvé a abrirlo.`,
        LONG_NOTICE_MS,
      );
    }
    // First the whole flyer, then the cuts and only then the logos: they are in its coordinates.
    sections.forgetCuts();
    workspace.setCuts(work.cuts);
    const { legal } = work;
    workspace.setLegal(typeof legal === "string" && legal.trim() ? legal : workspace.optionLegal());
    core.replaceList(work.changes, { selected: -1, activeWork: work.id });
    core.startHistoryHere();
    isBusy = false;
    core.settle();
    for (const listener of openedListeners) listener(work);
    const missing = missingUploads(work.changes, work.uploads, workspace.logos);
    if (missing.length > 0) notify(missingUploadsText(missing), LONG_NOTICE_MS);
    if (work.warnChanged) {
      update(work.id, { warnChanged: false });
      notify(
        `Ojo: el flyer «${env.optionLabel?.(work.option) ?? ""}» cambió desde que se guardó este diseño. Revisá que todo haya quedado en su lugar.`,
      );
    }
  };

  const open = async (id: string) => {
    const work = find(id);
    if (!work || activeWork()?.id === id) return;
    if (!canUse(work.option)) {
      notify("El flyer base de este prototipo ya no está disponible.");
      return;
    }
    keepActive();
    turn += 1;
    const mine = turn;
    core.set({ activeWork: null, list: [], selected: -1, group: [], places: [] });
    isBusy = true;
    sections.forgetCuts();
    // If something else is chosen before it opens, what comes out is not what was on screen before.
    core.publish();
    // If the opening does not end (the load failed, something else was chosen), nothing stays stuck.
    setTimeout(() => {
      if (mine === turn && core.getState().activeWork !== id) isBusy = false;
    }, OPENING_GIVES_UP_MS);
    const stillThis = () => {
      const isThis = mine === turn && optionOnScreen() === work.option && find(id) !== undefined;
      if (!isThis && mine === turn) isBusy = false;
      return isThis;
    };
    const loaded = await selectOption(work.option);
    if (!stillThis()) return;
    // Its base flyer did not load: the changes do not go on another picture (invariant 23).
    if (!loaded.scene) {
      isBusy = false;
      return;
    }
    await Promise.all([
      restoreUploads(find(id)?.uploads ?? {}, workspace.logos, origins),
      workspace.sections.bring(work.cuts),
    ]);
    if (stillThis()) applyWork(find(id) ?? work);
  };

  /** Nothing of a work stays on screen, and the flyer is whole again. */
  const clearScreen = () => {
    sections.forgetCuts();
    core.set({ activeWork: null, list: [], art: core.currentArt(), selected: -1, group: [] });
    core.startHistoryHere();
  };

  const closeNow = (id: string) => {
    const work = find(id);
    if (!work) return;
    turn += 1;
    if (activeWork()?.id === id) {
      clearScreen();
      if (typeof work.legal === "string" || work.temp) workspace.setLegal(workspace.optionLegal());
      core.settle();
    }
    const works = core.getState().works.filter((other) => other.id !== id);
    core.set({ works, closingWork: null });
    saveSoon();
  };

  const hasChanges = (work: OpenWork) =>
    activeWork()?.id === work.id
      ? core.active().length > 0 || core.cuts().length > 0
      : work.changes.length > 0 || work.cuts.length > 0;

  const add = (work: OpenWork) => {
    const others = core.getState().works.filter(({ id }) => id !== work.id);
    if (core.getState().activeWork === work.id) core.set({ activeWork: null });
    core.set({ works: [...others, work] });
  };

  return {
    activeWork,
    canUse,
    isOpening: () => isBusy,
    isReviewed: () => isReviewed,
    storageKey: () => draftsKey(personId()),
    autoDraft,
    /** Everything that changed the list ends here. */
    afterChange: () => {
      autoDraft();
      if (activeWork()?.temp) saveSoon();
    },
    saveSoon,
    offerSoon,
    /** The screen goes away: what was about to be saved is saved now, and nothing runs later. */
    stop: () => {
      clearTimeout(offerTimer);
      isOffered = false;
      if (saveTimer === undefined) return;
      clearTimeout(saveTimer);
      saveTimer = undefined;
      saveNow();
    },
    keepActive,
    /** The × of the sign of a design: what is on screen stays, without a design open. */
    letGoDesign: () => {
      core.set({ activeWork: null });
    },
    add,
    open,
    /** Whoever needs to do something when a work is on screen: the form takes its company. */
    onOpened: (listener: (work: OpenWork) => void) => {
      openedListeners.add(listener);
      return () => {
        openedListeners.delete(listener);
      };
    },
    /**
     * "Usar": it does not step on the flyer, it opens beside it, always with what is saved. It has a
     * number from the moment it was asked for: if something else is chosen meanwhile, it does not open.
     */
    openDesign: async (
      load: () => Promise<StoredDesign>,
      goToItsTab: (option: number) => void = () => undefined,
    ) => {
      turn += 1;
      const mine = turn;
      const design = await load();
      if (mine !== turn) return;
      const scene = workspace.optionScene(design.option);
      const flyerChanged = Boolean(
        design.baseName && scene && design.baseName !== artFileName(scene.whole.artKey),
      );
      add(designWork(design, flyerChanged));
      goToItsTab(design.option);
      await open(design.id);
    },
    /** A design was deleted in Estudio. */
    closeDesign: (id: string) => {
      closeNow(id);
    },
    /** The design that was just saved takes the place of what is open, with its name. */
    saved: (design: SavedDesign) => {
      const work = activeWork();
      const next = fromSaved(design);
      if (work?.id === design.id) {
        update(work.id, { ...next, shared: work.shared });
        core.set({ activeWork: design.id });
      } else if (work?.temp) {
        const works = core.getState().works.map((other) => (other.id === work.id ? next : other));
        core.set({ works, activeWork: design.id });
      } else {
        add(next);
        core.set({ activeWork: design.id });
      }
      saveSoon();
    },
    newDraft: () => {
      const option = optionOnScreen();
      if (option === null) return;
      const draft = create(option);
      void open(draft.id);
      notify(`«${draft.name}» listo: arranca del flyer original.`);
    },
    /**
     * A flyer of the history with its cuts or its logos opens in a draft, the same as the changes by
     * hand: the original stays clean. Its option has to be on screen already.
     */
    openStored: async ({ option, logos, cuts, legal }: StoredWork) => {
      const draft = create(option);
      update(draft.id, { changes: placedChanges(logos), cuts, legal });
      // First this: what opening it has to say about a missing logo goes after.
      notify(
        `Tus cambios quedaron en «${draft.name}», al lado del flyer original. El original no se tocó.`,
      );
      await open(draft.id);
      saveSoon();
    },
    /** A flyer of the bar was chosen. It says whether it still has to go there. */
    chooseFlyer: (option: number): boolean => {
      turn += 1;
      isBusy = false;
      const work = activeWork();
      if (!work) return true;
      keepActive();
      clearScreen();
      if (optionOnScreen() !== option) return true;
      if (typeof work.legal === "string") workspace.setLegal(workspace.optionLegal());
      core.settle();
      return false;
    },
    /** Restaurar: the original comes back clean, and a draft keeps what is its own. */
    backToOriginal: () => {
      keepActive();
      turn += 1;
      isBusy = false;
      clearScreen();
    },
    askToClose: (id: string) => {
      const work = find(id);
      if (!work) return;
      if (work.temp && hasChanges(work)) core.set({ closingWork: id });
      else closeNow(id);
    },
    confirmClose: () => {
      const { closingWork } = core.getState();
      if (closingWork) closeNow(closingWork);
    },
    cancelClose: () => {
      core.set({ closingWork: null });
    },
    recover: () => {
      const list = pending;
      pending = [];
      core.set({ recoverable: null });
      let lost = 0;
      for (const stored of list) {
        const option = stored.opcion;
        const taken = drafts().some(
          ({ option: other, name }) => other === option && name === stored.nombre,
        );
        const draft = create(option, stored.nombre && !taken ? stored.nombre : undefined);
        const changes = Array.isArray(stored.cambios) ? stored.cambios : [];
        const uploads = stored.subidos ?? {};
        update(draft.id, {
          changes,
          cuts: Array.isArray(stored.recortes) ? stored.recortes : [],
          legal: typeof stored.legal === "string" ? stored.legal : null,
          uploads,
        });
        lost += new Set(
          changes.flatMap(({ img }) => (img?.startsWith("pc:") && !uploads[img] ? [img] : [])),
        ).size;
      }
      saveNow();
      notify(
        `${
          list.length === 1
            ? "Borrador recuperado: está en su pestaña, al lado del flyer."
            : `${String(list.length)} borradores recuperados: están en sus pestañas, al lado de su flyer.`
        }${lostUploadsText(lost)}`,
      );
    },
    discard: () => {
      pending = [];
      core.set({ recoverable: null });
      saveNow();
      notify("Borradores descartados.");
    },
  };
}
