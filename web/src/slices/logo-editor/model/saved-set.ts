// A saved set of brands ("Marcas guardadas"): what was changed on a flyer, with a name, to be applied
// on the new model of the flyer. It is not tied to a picture: it keeps pixels of the picture of that
// moment and the boxes of what surrounded each thing, to look for that same group on the new one.
// It is stored in flyer_disenos.datos, so its keys stay in Spanish.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import {
  isSupermarket,
  isBetterPromotion,
  type Promotion,
} from "@/shared/domain/promotions/index.ts";
import { isFromFlyer, isUploaded, type PlacedChange } from "./change.ts";
import { detectStrip } from "./strip-detect.ts";
import { currentSelection } from "./strip-opening.ts";
import type { StripBox, StripPick } from "./strip-types.ts";

export const SAVED_SET_VERSION = 2;
const DAY_TEXT_AIR = 8;
const DAYS_REACH = 2.2;
const STRIP_CONTEXT = 0.03;
const GROUP_CONTEXT = 1.3;
const GROUP_REACH = 1.6;
const NEAREST_BOXES = 60;

export interface RelativeBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SavedStrip {
  readonly tipo: "franja";
  readonly nombre: string;
  readonly rect: StripBox;
  readonly sel: readonly StripPick[];
  readonly cols: number;
  readonly kt: number;
  readonly conDias: boolean;
  readonly n: number;
  readonly caja: StripBox | null;
  readonly cajas: readonly StripBox[];
  readonly ctx: readonly StripBox[];
}

export interface SavedLogo {
  readonly tipo: "logo";
  readonly nombre: string;
  readonly img: string;
  readonly t: string;
  readonly lugar: StripBox;
  readonly dup: boolean;
  readonly rel: RelativeBox;
  readonly esSuper: boolean;
  readonly conDias?: boolean;
  readonly mover?: boolean;
  readonly g?: number;
}

export interface SavedText {
  readonly tipo: "texto";
  readonly nombre: string;
  readonly texto: string | undefined;
  readonly color: string | undefined;
  readonly peso: unknown;
  readonly fs: number | undefined;
  readonly lugar: StripBox;
  readonly vacio: boolean;
  readonly pos: { readonly x: number | undefined; readonly y: number | undefined };
}

export interface SavedEmpty {
  readonly tipo: "vacio";
  readonly nombre: string;
  readonly lugar: StripBox;
  readonly g?: number;
}

export type SavedItem = SavedStrip | SavedLogo | SavedText | SavedEmpty;

export interface SavedGroup {
  readonly items: readonly number[];
  readonly ctx: readonly StripBox[] | null;
}

export interface SavedSetData {
  readonly v: number;
  readonly ancho: number;
  readonly alto: number;
  readonly items: readonly SavedItem[];
  readonly grupos: readonly SavedGroup[];
  readonly subidos: Readonly<Record<string, string>>;
  readonly prov?: string;
  readonly resumen?: string;
  readonly flyer?: string;
}

export function boundsOf(boxes: readonly StripBox[]): StripBox | null {
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map(({ x }) => x));
  const y0 = Math.min(...boxes.map(({ y }) => y));
  const x1 = Math.max(...boxes.map(({ x, w }) => x + w));
  const y1 = Math.max(...boxes.map(({ y, h }) => y + h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The boxes of the drawings around a zone, up to 60, the nearest ones. */
export function contextOf(box: StripBox, margin: number, all: readonly StripBox[]): StripBox[] {
  const [x0, y0, x1, y1] = [
    box.x - margin,
    box.y - margin,
    box.x + box.w + margin,
    box.y + box.h + margin,
  ];
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const distance = (one: StripBox) =>
    Math.abs(one.x + one.w / 2 - cx) + Math.abs(one.y + one.h / 2 - cy);
  return all
    .filter(({ x, y, w, h }) => x >= x0 && y >= y0 && x + w <= x1 && y + h <= y1)
    .toSorted((one, other) => distance(one) - distance(other))
    .slice(0, NEAREST_BOXES)
    .map(({ x, y, w, h }) => ({
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    }));
}

function sizeWord(count: number, one: string, many: string): string {
  if (!count) return "";
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** "1 franja, 2 logos, 1 lugar vacío". */
export function summaryOf(items: readonly SavedItem[]): string {
  const countOf = (kind: SavedItem["tipo"]) => items.filter(({ tipo }) => tipo === kind).length;
  const parts = [
    sizeWord(countOf("franja"), "franja", "franjas"),
    sizeWord(countOf("logo"), "logo", "logos"),
    sizeWord(countOf("vacio"), "lugar vacío", "lugares vacíos"),
    sizeWord(countOf("texto"), "texto", "textos"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nada";
}

/** The promotion of a logo that wins among those of the catalog. */
export function promotionOfLogo(catalog: readonly Promotion[], logo: string): Promotion | null {
  let best: Promotion | null = null;
  for (const promotion of catalog) {
    if (promotion.imagen === logo && (!best || isBetterPromotion(promotion, best)))
      best = promotion;
  }
  return best;
}

/** Are these days of a supermarket that is right above? */
function isDaysOf(text: PlacedChange, logo: PlacedChange): boolean {
  const { tx = 0, ty = 0, tw = 0, th = 0 } = text;
  const [cx, cy] = [tx + tw / 2, ty + th / 2];
  const logoTx = logo.tx ?? 0;
  const logoTy = logo.ty ?? 0;
  const logoTw = logo.tw ?? 0;
  const logoTh = logo.th ?? 0;
  const left = Math.min(logo.ox, logoTx);
  const right = Math.max(logo.ox + logo.ow, logoTx + logoTw);
  const bottom = Math.max(logo.oy + logo.oh, logoTy + logoTh);
  return (
    cx >= left - DAY_TEXT_AIR &&
    cx <= right + DAY_TEXT_AIR &&
    cy >= bottom - 4 &&
    cy <= bottom + Math.max(logo.oh, logoTh) * DAYS_REACH
  );
}

function stripItem(
  list: readonly PlacedChange[],
  base: PlacedChange,
  art: FlyerArt,
  catalog: readonly Promotion[],
  boxes: readonly StripBox[],
): SavedStrip | null {
  const selection = currentSelection(list, base);
  if (selection.length === 0) return null;
  const rect = { x: base.ox, y: base.oy, w: base.ow, h: base.oh };
  let detected: ReturnType<typeof detectStrip> | null = null;
  try {
    detected = detectStrip(
      art,
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.w),
      Math.round(rect.h),
    );
  } catch {
    detected = null;
  }
  const supers = selection.filter(({ img }) => {
    const promotion = promotionOfLogo(catalog, img);
    return promotion && isSupermarket(promotion);
  }).length;
  const count = selection.length;
  return {
    tipo: "franja",
    nombre: `${supers >= count / 2 ? "Franja súper" : "Franja"} (${String(count)}${count === 1 ? " marca)" : " marcas)"}`,
    rect,
    sel: selection,
    cols: base.franjaCols ?? 0,
    kt: base.franjaKt ?? 1,
    conDias: list.some(({ franja, tipo }) => franja === base.franja && tipo === "txt"),
    n: detected?.n ?? base.franjaInfo?.n ?? 0,
    caja: detected ? boundsOf(detected.cajas) : null,
    cajas: detected?.cajas ?? [],
    ctx: contextOf(rect, Math.max(rect.w, rect.h) * STRIP_CONTEXT, boxes),
  };
}

function placeOf({ ox, oy, ow, oh }: PlacedChange): StripBox {
  return { x: ox, y: oy, w: ow, h: oh };
}

function logoItem(change: PlacedChange, catalog: readonly Promotion[]): SavedLogo {
  const { img = "", t, ox, oy, tx = 0, ty = 0, tw = 0, th = 0 } = change;
  const [w, h] = [Math.max(1, change.ow), Math.max(1, change.oh)];
  const promotion = isUploaded(img) || isFromFlyer(img) ? null : promotionOfLogo(catalog, img);
  const moved = isFromFlyer(img);
  return {
    tipo: "logo",
    nombre: moved ? "Logo del flyer movido" : t || "Logo",
    img,
    t: t || "",
    lugar: placeOf(change),
    dup: Boolean(change.dup),
    rel: { x: (tx - ox) / w, y: (ty - oy) / h, w: tw / w, h: th / h },
    esSuper: Boolean(promotion && isSupermarket(promotion)),
    ...(moved ? { mover: true } : {}),
  };
}

function textItem(change: PlacedChange): SavedText {
  const { texto, color, peso, fs, vacio, tx, ty } = change;
  return {
    tipo: "texto",
    nombre: `Texto «${(texto ?? "").replaceAll("\n", " ").slice(0, 30)}»`,
    texto,
    color,
    peso,
    fs,
    lugar: placeOf(change),
    vacio: Boolean(vacio),
    pos: { x: tx, y: ty },
  };
}

function isGroupable(item: SavedItem): item is SavedLogo | SavedEmpty {
  return (item.tipo === "logo" && !item.dup) || item.tipo === "vacio";
}

function areClose(one: StripBox, other: StripBox): boolean {
  const reach = Math.max(one.w, one.h, other.w, other.h) * GROUP_REACH;
  const dx = Math.max(0, Math.max(one.x, other.x) - Math.min(one.x + one.w, other.x + other.w));
  const dy = Math.max(0, Math.max(one.y, other.y) - Math.min(one.y + one.h, other.y + other.h));
  return dx <= reach && dy <= reach;
}

/** Loose logos and empty places close to each other: the grid of supermarkets. */
export function groupsOf(items: readonly SavedItem[]): readonly (readonly number[])[] {
  const members = items.flatMap((item, index) =>
    isGroupable(item) ? [{ index, box: item.lugar }] : [],
  );
  const parent = new Map(members.map(({ index }) => [index, index]));
  const rootOf = (index: number): number => {
    const up = parent.get(index) ?? index;
    return up === index ? index : rootOf(up);
  };
  for (const one of members) {
    for (const other of members) {
      if (one.index < other.index && areClose(one.box, other.box)) {
        parent.set(rootOf(one.index), rootOf(other.index));
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const { index } of members) {
    const root = rootOf(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  }
  return [...groups.values()];
}

function logosWithDays(
  items: readonly SavedItem[],
  logos: readonly PlacedChange[],
  texts: readonly PlacedChange[],
): readonly SavedItem[] {
  return items.map((item) => {
    if (item.tipo !== "logo" || !item.esSuper) return item;
    const logo = logos.find(
      ({ img, ox, oy }) => img === item.img && ox === item.lugar.x && oy === item.lugar.y,
    );
    const hasDays = logo && texts.some((text) => isDaysOf(text, logo));
    return hasDays ? { ...item, conDias: true } : item;
  });
}

export interface ArmingInput {
  readonly list: readonly PlacedChange[];
  readonly art: FlyerArt;
  readonly catalog: readonly Promotion[];
  /** The drawings of the whole flyer. */
  readonly boxes: readonly StripBox[];
  readonly uploads: Readonly<Record<string, string>>;
}

function looseOf(list: readonly PlacedChange[], taken: ReadonlySet<PlacedChange>) {
  return list.filter((change) => !taken.has(change));
}

/** What the flyer has now, ready to be kept. The days of supermarkets are worked out when applying. */
export function armSavedSet({ list, art, catalog, boxes, uploads }: ArmingInput): SavedSetData {
  const strips = list.filter(({ franjaBase }) => franjaBase);
  const stripItems = strips.flatMap((base) => stripItem(list, base, art, catalog, boxes) ?? []);
  const stripIds = new Set(
    strips.filter((base) => currentSelection(list, base).length > 0).map(({ franja }) => franja),
  );
  const inStrip = new Set(list.filter(({ franja }) => franja && stripIds.has(franja)));
  const rest = looseOf(list, inStrip);
  const logos = rest.filter(({ tipo, img, franjaBase }) => tipo !== "txt" && img && !franjaBase);
  const logoItems = logos.map((logo) => logoItem(logo, catalog));
  const supers = logos.filter((_logo, index) => logoItems[index]?.esSuper);
  const texts = rest.filter(({ tipo, franja }) => tipo === "txt" && !franja);
  const dayTexts = texts.filter((text) => supers.some((logo) => isDaysOf(text, logo)));
  const looseTexts = texts.filter((text) => !dayTexts.includes(text)).map(textItem);
  const empties: SavedEmpty[] = rest
    .filter(
      ({ tipo, img, franjaBase, franja, w, h }) =>
        tipo !== "txt" && !img && !franjaBase && !franja && w > 0 && h > 0,
    )
    .map((change) => ({ tipo: "vacio", nombre: "Lugar vacío", lugar: placeOf(change) }));
  const items = [
    ...stripItems,
    ...logosWithDays(logoItems, logos, dayTexts),
    ...looseTexts,
    ...empties,
  ];
  const grupos = groupsOf(items).map((indexes) => {
    const places = indexes.flatMap((index) => {
      const item = items[index];
      return item && item.tipo !== "franja" ? [item.lugar] : [];
    });
    const margin = Math.max(...places.map(({ w, h }) => Math.max(w, h))) * GROUP_CONTEXT;
    const bounds = boundsOf(places) ?? { x: 0, y: 0, w: 0, h: 0 };
    return { items: indexes, ctx: contextOf(bounds, margin, boxes) };
  });
  return {
    v: SAVED_SET_VERSION,
    ancho: art.width,
    alto: art.height,
    items,
    grupos,
    subidos: uploads,
  };
}
