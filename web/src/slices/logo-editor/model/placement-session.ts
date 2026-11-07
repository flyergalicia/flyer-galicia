// Applying a saved set. If everything was found it is put at once and seen on the flyer ("Así queda"),
// to keep it, review it or go back. If not, one thing at a time: the bar says what is being placed and
// the flyer marks where it would go. Everything put is a change of the list as any other.
import {
  isSupermarket,
  promotionZone,
  type Promotion,
  provincesName,
  supermarketIndexOf,
} from "@/shared/domain/promotions/index.ts";
import type { FlyerPlace, PlacedChange } from "./change.ts";
import type { EditorCore, EditorEnvironment } from "./editor-state.ts";
import { detectLogo, hasFailed, markedPlace } from "./flyer-pixels.ts";
import { markReaderFor } from "./flyer-marks.ts";
import type { OpenWorks } from "./open-works.ts";
import {
  changeKey,
  finalText,
  isAtTheEnd,
  itemNow,
  NO_COUNTS,
  orderOf,
  placeNow,
  type PlacementPhoto,
  type PlacedCounts,
  type PlacementTallies,
  type PlacementView,
} from "./placement-model.ts";
import {
  clipped,
  drawingsOnce,
  type ItemPlace,
  locateItems,
  matchGroup,
} from "./saved-set-matching.ts";
import type { SavedItem, SavedLogo, SavedSetData, SavedStrip, SavedText } from "./saved-set.ts";
import { promotionOfLogo } from "./saved-set.ts";
import { builtStrip } from "./strip-build.ts";
import { stripDays } from "./strip-days.ts";
import { detectStrip } from "./strip-detect.ts";
import { stripToResume } from "./strip-opening.ts";
import type { StripBox } from "./strip-types.ts";
import { restoreUploads } from "./uploads.ts";

const SMALLEST_BOX = 12;
const SMALLEST_TEXT_FONT = 10;
const FIND_SHARE = 0.4;
const WHOLE_OVERLAP = 0.5;

export interface PlacementHands {
  readonly placeLogo: (
    place: FlyerPlace,
    image: string,
    title: string,
    logo: HTMLCanvasElement | null,
  ) => void;
  readonly placeText: (
    place: FlyerPlace,
    content: { texto: string; color: string; peso: number; fs: number },
    previous: PlacedChange | null,
  ) => number;
  readonly placeSupermarket: (
    place: FlyerPlace,
    image: string,
    title: string,
    logo: HTMLCanvasElement,
    days: string,
  ) => string;
  readonly moveFromFlyer: (place: FlyerPlace) => void;
  readonly putStrip: (list: readonly PlacedChange[]) => void;
  readonly letAllGo: () => void;
  /** Before placing: the other modes close. */
  readonly openPlaceless: () => void;
}

export type Placement = ReturnType<typeof createPlacement>;

interface FlyerPoint {
  readonly x: number;
  readonly y: number;
}

/** One after the other: each one looks at what the one before left. */
function inTurn(items: readonly number[], work: (item: number) => Promise<void>): Promise<void> {
  return items.reduce((before, item) => before.then(() => work(item)), Promise.resolve());
}

let stripsMade = 0;

function newStripId(): string {
  stripsMade += 1;
  return `fr${String(Date.now())}${String(stripsMade)}`;
}

function isMine(change: PlacedChange, place: FlyerPlace): boolean {
  const width = Math.min(change.ox + change.ow, place.x + place.w) - Math.max(change.ox, place.x);
  const height = Math.min(change.oy + change.oh, place.y + place.h) - Math.max(change.oy, place.y);
  if (width <= 0 || height <= 0) return false;
  return width * height > WHOLE_OVERLAP * Math.min(change.ow * change.oh, place.w * place.h);
}

/** What was there BEFORE applying, on that place: -1 and it goes as a new one. */
function formerIndex(
  list: readonly PlacedChange[],
  place: FlyerPlace,
  before: ReadonlySet<string>,
): number {
  return list.findIndex(
    (change) => !change.franjaBase && before.has(changeKey(change)) && isMine(change, place),
  );
}

export function createPlacement(
  core: EditorCore,
  works: OpenWorks,
  env: EditorEnvironment,
  hands: PlacementHands,
) {
  const { workspace, notify } = core;
  const catalog = env.catalog ?? (() => ({ shown: [], all: [] }));
  const origins = new Map<string, string>();
  /** The last one applied: on saving later, replacing it is offered. */
  let lastApplied: { readonly id: string; readonly name: string } | null = null;

  const view = () => core.getState().placement;
  const update = (next: Partial<PlacementView>) => {
    const current = view();
    if (current) core.set({ placement: { ...current, ...next } });
  };

  const photo = (current: PlacementView): PlacementPhoto => ({
    list: JSON.stringify(core.active()),
    counts: current.counts,
    approx: current.approx,
    skipped: current.skipped,
  });

  const backTo = (target: PlacementPhoto) => {
    const list: readonly PlacedChange[] = JSON.parse(target.list);
    core.replaceList(list, { selected: -1, group: [], places: [] });
    core.settle();
  };

  const tallies = ({ data }: PlacementView): PlacementTallies => {
    const reader = markReaderFor(catalog().all);
    const province = data.prov ?? "";
    const list = core.active();
    return {
      expired: list.filter(reader.isExpired).length,
      outOfProvince: province
        ? list.filter((change) => change.prov === province && reader.isOutOfProvince(change)).length
        : 0,
      province: province ? provincesName(province) : "",
    };
  };

  const daysOf = (promotion: Promotion, province: string | undefined): string => {
    const index = supermarketIndexOf(catalog().shown);
    return index.flyerDays(promotion, promotionZone(province ?? ""));
  };

  const putStrip = async (item: SavedStrip, rect: StripBox, current: PlacementView) => {
    const art = core.picture();
    const selection = item.sel.filter(({ img }) => !current.failedLogos.has(img));
    if (selection.length === 0) {
      update({ approx: [...current.approx, `${item.nombre} (no se pudieron bajar sus logos)`] });
      return 0;
    }
    const place = art && markedPlace(art, rect.x, rect.y, rect.w, rect.h);
    if (!art || !place) return 0;
    const previous = stripToResume(core.active(), place);
    const read = detectStrip(art, place.x, place.y, place.w, place.h);
    const info = { ...read, bg: place.bg || read.bg };
    const images = await Promise.all(selection.map(({ img }) => workspace.logos.fetch(img)));
    if (core.currentArt() !== current.art) return 0;
    const shown = catalog().shown;
    const firstSuper = (logo: string) =>
      shown.find((promotion) => promotion.imagen === logo && isSupermarket(promotion));
    hands.putStrip(
      builtStrip(core.ownList(), {
        id: previous?.franja ?? newStripId(),
        rect: place,
        info,
        selection,
        perRow: item.cols,
        sizeOfAll: item.kt,
        aspects: images.map(({ width, height }) => width / height),
        days: (places) =>
          stripDays({
            art,
            info,
            selection,
            places,
            withDays: item.conDias,
            daysOf: (logo) => {
              const promotion = firstSuper(logo);
              return promotion ? daysOf(promotion, undefined) : "";
            },
          }),
      }),
    );
    return 1;
  };

  const putMoved = (item: SavedLogo, place: FlyerPlace) => {
    hands.moveFromFlyer(place);
    const list = core.ownList();
    const { selected } = core.getState();
    const moved = list[selected];
    if (!moved) return;
    const { x, y, w, h } = item.rel;
    const [tw, th] = [w * place.w, h * place.h];
    core.replaceList(
      list.with(selected, {
        ...moved,
        tx: place.x + x * place.w,
        ty: place.y + y * place.h,
        tw,
        th,
        bw: tw,
        bh: th,
      }),
    );
  };

  /** The size and the shift given by hand, in proportion to its place. */
  const putLogoAsItWas = (item: SavedLogo, place: FlyerPlace, logo: HTMLCanvasElement) => {
    hands.placeLogo(place, item.img, item.t, logo);
    const list = core.ownList();
    const { selected } = core.getState();
    const placed = list[selected];
    // As in the old app: it only applies when it replaced something that was there before.
    if (place.indice === -1 || placed?.img !== item.img || !(item.rel.w > 0)) return;
    const [tw, th] = [item.rel.w * place.w, item.rel.h * place.h];
    core.replaceList(
      list.with(selected, {
        ...placed,
        tx: place.x + item.rel.x * place.w,
        ty: place.y + item.rel.y * place.h,
        tw,
        th,
        bw: tw,
        bh: th,
        ...(item.dup ? { dup: true } : {}),
      }),
    );
  };

  const putLogo = (item: SavedLogo, place: FlyerPlace, current: PlacementView) => {
    if (item.mover) {
      putMoved(item, place);
      return true;
    }
    if (current.failedLogos.has(item.img)) {
      update({ approx: [...current.approx, `${item.nombre} (no se pudo bajar)`] });
      return false;
    }
    const art = core.picture();
    const logo = art && workspace.logos.imageFor(item.img, art, core.currentArt());
    if (!(logo instanceof HTMLCanvasElement)) {
      update({ approx: [...current.approx, `${item.nombre} (no se pudo cargar el logo)`] });
      return false;
    }
    if (item.esSuper && item.conDias) {
      const promotion = promotionOfLogo(catalog().shown, item.img);
      const days = promotion ? daysOf(promotion, current.data.prov) : "";
      hands.placeSupermarket(place, item.img, item.t, logo, days);
    } else {
      putLogoAsItWas(item, place, logo);
    }
    return true;
  };

  const putText = (item: SavedText, place: FlyerPlace, scale: number) => {
    hands.placeText(
      place,
      {
        texto: item.texto ?? "",
        color: item.color ?? "",
        peso: Number(item.peso) || 0,
        fs: Math.max(SMALLEST_TEXT_FONT, (item.fs ?? 0) * scale),
      },
      null,
    );
  };

  const count = (kind: keyof PlacedCounts) => {
    const counts = view()?.counts ?? NO_COUNTS;
    update({ counts: { ...counts, [kind]: counts[kind] + 1 } });
  };

  const putLoose = (
    item: Exclude<SavedItem, SavedStrip>,
    place: FlyerPlace,
    current: PlacementView,
  ) => {
    if (item.tipo === "vacio") {
      hands.placeLogo(place, "", "", null);
      count("vacio");
    } else if (item.tipo === "texto") {
      putText(item, place, current.scale);
      count("texto");
    } else if (putLogo(item, place, current)) {
      count("logo");
    }
  };

  /** Puts one thing on its place. */
  const putItem = async (item: SavedItem, place: ItemPlace) => {
    const current = view();
    if (!current) return;
    if (item.tipo === "franja") {
      if (place.rect && (await putStrip(item, place.rect, current))) count("franja");
    } else if (place.det) {
      const indice = formerIndex(core.active(), place.det, current.before);
      putLoose(item, { ...place.det, indice }, current);
    }
  };

  /** What this application put carries the province it was saved with, for the yellow mark. */
  const markProvince = (current: PlacementView) => {
    const province = current.data.prov;
    if (!province) return;
    const isNew = (change: PlacedChange) =>
      change.img && change.tipo !== "txt" && !change.prov && !current.before.has(changeKey(change));
    const list = core
      .ownList()
      .map((change) => (isNew(change) ? Object.assign({}, change, { prov: province }) : change));
    core.replaceList(list);
  };

  const finish = (quiet = false) => {
    const current = view();
    if (current?.isBusy && !quiet) return;
    core.set({ placement: null });
    if (!current) return;
    // "Así queda": what was put stays, and only now it moves to a draft.
    if (current.mode === "preview" && !current.isBusy && core.currentArt() === current.art) {
      works.autoDraft(true);
      core.settle();
      core.noteStepNow();
    }
    if (!quiet) notify(finalText(current, tallies(current)));
  };

  const wasCut = (current: PlacementView) => {
    if (core.currentArt() === current.art) return false;
    notify("Cambió el flyer: se cortó la colocación.");
    finish(true);
    return true;
  };

  const startSteps = (current: PlacementView) => {
    core.noteStepNow(); // What was before stays as its own step of Deshacer.
    hands.openPlaceless();
    core.set({
      placement: { ...current, mode: "steps", index: 0, photos: [], done: [], used: [] },
    });
  };

  const placeHere = async (chosen?: ItemPlace) => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "steps" || isAtTheEnd(current)) return;
    if (wasCut(current)) return;
    const item = itemNow(current);
    const place = chosen ?? placeNow(current);
    if (!item || !place) return;
    const step = current.index;
    const before = photo(current);
    update({
      photos: [...current.photos, before],
      isBusy: true,
      approx: !chosen && !place.ok ? [...current.approx, item.nombre] : current.approx,
    });
    try {
      await putItem(item, place);
      const after = view();
      if (!after || wasCut(after)) return;
      markProvince(after);
      update({
        isBusy: false,
        done: [...after.done, "placed"],
        used: [...after.used, place],
        index: step + 1,
      });
      hands.letAllGo();
      core.settle();
    } catch {
      update({ isBusy: false, approx: before.approx, photos: current.photos });
      notify(`No se pudo poner «${item.nombre}». Probá de nuevo o saltalo.`);
    }
  };

  const goToStep = (step: number) => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "steps" || step === current.index) return;
    if (step < 0 || step >= current.order.length) return;
    if (step < current.index) {
      const target = current.photos[step];
      if (!target || wasCut(current)) return;
      backTo(target);
      update({
        index: step,
        counts: target.counts,
        approx: target.approx,
        skipped: target.skipped,
        photos: current.photos.slice(0, step),
        done: current.done.slice(0, step),
        used: current.used.slice(0, step),
      });
      return;
    }
    // One that is missing becomes the one of now; the others follow in their order.
    const itemIndex = current.order[step] ?? 0;
    const order = current.order.toSpliced(step, 1).toSpliced(current.index, 0, itemIndex);
    update({ order });
  };

  const back = () => {
    const current = view();
    if (!current || current.isBusy) return;
    if (current.mode === "preview") {
      restore();
      return;
    }
    if (current.index > 0) goToStep(current.index - 1);
  };

  const restore = () => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "preview" || !current.firstPhoto) return;
    core.set({ placement: null });
    backTo(current.firstPhoto);
    core.noteStepNow();
    notify("Listo: el flyer quedó como estaba.");
  };

  const review = () => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "preview" || !current.firstPhoto) return;
    backTo(current.firstPhoto);
    startSteps({ ...current, counts: NO_COUNTS, approx: [], skipped: 0 });
  };

  /** The sure ones, each as a step: Atrás takes them out one at a time. */
  const putSureOne = async (itemIndex: number) => {
    const running = view();
    if (!running || core.currentArt() !== running.art) return;
    const item = running.data.items[itemIndex];
    const place = running.places[itemIndex];
    if (!item || !place) return;
    const before = photo(running);
    await putItem(item, place);
    const after = view();
    if (!after) return;
    update({
      photos: [...after.photos, before],
      done: [...after.done, "placed"],
      used: [...after.used, place],
      index: after.index + 1,
    });
  };

  const placeSure = async () => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "steps" || wasCut(current)) return;
    const left = current.order.slice(current.index);
    const sure = left.filter((index) => current.places[index]?.ok);
    if (sure.length === 0) return;
    const doubtful = left.filter((index) => !current.places[index]?.ok);
    update({
      order: [...current.order.slice(0, current.index), ...sure, ...doubtful],
      isBusy: true,
    });
    try {
      await inTurn(sure, putSureOne);
    } catch {
      update({ isBusy: false });
      const failed = view();
      if (failed) markProvince(failed);
      core.settle();
      notify("No se pudo poner todo de una: seguí de a uno.");
      return;
    }
    const after = view();
    if (!after || wasCut(after)) return;
    markProvince(after);
    update({ isBusy: false });
    hands.letAllGo();
    core.settle();
    const missing = after.order.length - after.index;
    if (missing > 0) {
      const left2 = missing === 1 ? "Queda 1" : `Quedan ${String(missing)}`;
      notify(`Puse ${String(sure.length)}. ${left2} para ubicar juntos.`);
    }
  };

  const putPreviewOne = async (itemIndex: number) => {
    const running = view();
    if (!running || core.currentArt() !== running.art) return;
    const item = running.data.items[itemIndex];
    const place = running.places[itemIndex];
    if (!item || !place) return;
    await putItem(item, place);
    const after = view();
    if (after) {
      update({
        done: [...after.done, "placed"],
        used: [...after.used, place],
        index: after.index + 1,
      });
    }
  };

  const startPreview = async (current: PlacementView) => {
    core.noteStepNow(); // What was before stays as its own step of Deshacer.
    hands.openPlaceless();
    core.set({
      placement: { ...current, mode: "preview", isBusy: true, firstPhoto: photo(current) },
    });
    try {
      await inTurn(current.order, putPreviewOne);
    } catch {
      const failed = view();
      if (!failed) return;
      update({ isBusy: false });
      notify("No se pudo poner todo de una: vamos uno por uno.");
      review();
      return;
    }
    const after = view();
    if (!after) return;
    if (core.currentArt() !== after.art) {
      notify("Cambió el flyer mientras se ponían: se cortó a la mitad.");
      finish(true);
      return;
    }
    markProvince(after);
    update({ isBusy: false });
    hands.letAllGo();
    core.settle();
  };

  /** A set is prepared on the flyer of now: its logos come down, and everything is located. */
  const prepare = async (data: SavedSetData, name: string): Promise<PlacementView | null> => {
    const art = core.currentArt();
    await restoreUploads(data.subidos, workspace.logos, origins);
    const wanted = new Set(
      data.items.flatMap((item) => {
        if (item.tipo === "franja") return item.sel.map(({ img }) => img);
        return item.tipo === "logo" && !item.mover && !item.img.startsWith("pc:") ? [item.img] : [];
      }),
    );
    const results = await Promise.all(
      [...wanted].map((logo) =>
        workspace.logos.fetch(logo).then(
          () => null,
          () => logo,
        ),
      ),
    );
    const picture = core.picture();
    if (core.currentArt() !== art || !picture) return null;
    if (!core.getState().on) core.setOn(true);
    if (core.getState().art !== art) core.replaceList([]);
    return {
      data,
      name,
      mode: "steps",
      isBusy: false,
      order: orderOf(data.items),
      places: locateItems(data, picture, drawingsOnce(picture)),
      index: 0,
      art,
      scale: picture.width / Math.max(1, data.ancho || picture.width),
      failedLogos: new Set(results.flatMap((logo) => logo ?? [])),
      before: new Set(core.active().map(changeKey)),
      counts: NO_COUNTS,
      approx: [],
      skipped: 0,
      photos: [],
      done: [],
      used: [],
      firstPhoto: null,
    };
  };

  const boxMarked = (item: SavedItem, from: FlyerPoint, to: FlyerPoint) => {
    const art = core.picture();
    if (!art) return;
    const box = clipped(art, { x: from.x, y: from.y, w: to.x - from.x, h: to.y - from.y });
    if (box.w < SMALLEST_BOX || box.h < SMALLEST_BOX) {
      notify("Ese recuadro es muy chico.");
      return;
    }
    if (item.tipo === "franja") {
      void placeHere({ ok: true, rect: box });
      return;
    }
    const place = markedPlace(art, box.x, box.y, box.w, box.h);
    if (place) {
      void placeHere({ ok: true, det: item.tipo === "texto" ? { ...place, vacio: true } : place });
    }
  };

  const logoTouched = ({ x, y }: FlyerPoint) => {
    const art = core.picture();
    const found = art ? detectLogo(art, Math.round(x), Math.round(y)) : { error: "nada" as const };
    if (hasFailed(found)) {
      notify("Ahí no encontré un logo. Tocá justo encima del logo, o arrastrá un recuadro.");
      return;
    }
    void placeHere({ ok: true, det: found });
  };

  /** A touch or a box on the flyer while placing, in pixels of the picture. */
  const touched = (from: FlyerPoint, to: FlyerPoint, moved: boolean) => {
    const current = view();
    if (!current || current.isBusy || current.mode !== "steps" || isAtTheEnd(current)) return;
    const item = itemNow(current);
    if (!item) return;
    if (moved) boxMarked(item, from, to);
    else if (item.tipo === "franja") touchedForStrip(item, to, current);
    else if (item.tipo === "texto") notify("Para el texto, arrastrá un recuadro donde va.");
    else logoTouched(to);
  };

  /** The same shape of a strip over what was touched, or a strip already built there. */
  const touchedForStrip = (
    item: SavedStrip,
    point: { x: number; y: number },
    current: PlacementView,
  ) => {
    const art = core.picture();
    if (!art) return;
    const scaled = ({ x, y, w, h }: StripBox) => ({
      x: x * current.scale,
      y: y * current.scale,
      w: w * current.scale,
      h: h * current.scale,
    });
    const saved = (item.ctx.length > 0 ? item.ctx : item.cajas).map(scaled);
    const match = saved.length > 0 ? matchGroup(saved, drawingsOnce(art), point) : null;
    if (match && match.n >= Math.max(2, Math.ceil(saved.length * FIND_SHARE))) {
      const rect = scaled(item.rect);
      void placeHere({
        ok: true,
        rect: clipped(art, { ...rect, x: rect.x + match.dx, y: rect.y + match.dy }),
      });
      return;
    }
    const built = core
      .active()
      .find(
        ({ franjaBase, ox, oy, ow, oh }) =>
          franjaBase && point.x >= ox && point.x <= ox + ow && point.y >= oy && point.y <= oy + oh,
      );
    if (built) {
      void placeHere({ ok: true, rect: { x: built.ox, y: built.oy, w: built.ow, h: built.oh } });
      return;
    }
    notify("No reconocí una franja ahí. Arrastrá un recuadro alrededor de la franja donde va.");
  };

  // The flyer changes in the middle: the placement is cut by itself.
  workspace.subscribe(() => {
    const current = view();
    if (!current || current.isBusy || core.currentArt() === current.art) return;
    finish(true);
    notify("Cambió el flyer: se cortó la colocación de las marcas guardadas.");
  });

  return {
    lastApplied: () => lastApplied,
    noteApplied: (id: string, name: string) => {
      lastApplied = { id, name };
    },
    /** Applies a set: "Así queda" if everything was found; if not, one by one. */
    apply: async (id: string, name: string, data: SavedSetData) => {
      if (view()) finish(true);
      lastApplied = { id, name };
      const prepared = await prepare(data, name);
      if (!prepared) return;
      const total = prepared.order.length;
      const sure = prepared.order.filter((index) => prepared.places[index]?.ok).length;
      if (sure === total) {
        await startPreview(prepared);
        return;
      }
      startSteps(prepared);
      notify(
        sure
          ? `Encontré seguro ${String(sure)} de ${String(total)}. Vamos de a una: confirmá cada lugar o tocá otro.`
          : "Vamos de a una: te marco dónde iría cada cosa y vos la confirmás o tocás otro lugar.",
      );
    },
    place: () => {
      void placeHere();
    },
    skip: () => {
      const current = view();
      if (!current || current.isBusy || current.mode !== "steps" || isAtTheEnd(current)) return;
      update({
        photos: [...current.photos, photo(current)],
        skipped: current.skipped + 1,
        done: [...current.done, "skipped"],
        used: [...current.used, undefined],
        index: current.index + 1,
      });
    },
    goToStep,
    back,
    placeSure: () => {
      void placeSure();
    },
    restore,
    review,
    finish,
    /** Enter: the main button of the bar. */
    enter: () => {
      const current = view();
      if (!current || current.isBusy) return;
      if (current.mode === "preview" || isAtTheEnd(current)) finish();
      else void placeHere();
    },
    touched,
    daysFor: (logo: string, province: string | undefined): string => {
      const promotion = promotionOfLogo(catalog().shown, logo);
      return promotion ? daysOf(promotion, province) : "";
    },
    isOutOfProvince: (logo: string, province: string): boolean => {
      if (!province || logo.startsWith("pc:") || logo.startsWith("orig:")) return false;
      const change = {
        img: logo,
        prov: province,
        ox: 0,
        oy: 0,
        ow: 0,
        oh: 0,
        t: "",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        bg: "",
      };
      return markReaderFor(catalog().all).isOutOfProvince(change);
    },
  };
}
