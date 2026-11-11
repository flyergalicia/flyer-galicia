// A set of brands being applied: "Así queda" if everything was found, or one thing at a time. These
// are the pure parts: what is known, and what the bar says about it.
import type { PlacedChange } from "./change.ts";
import type { ItemPlace } from "./saved-set-matching.ts";
import type { SavedItem, SavedSetData } from "./saved-set.ts";

export interface PlacedCounts {
  readonly franja: number;
  readonly logo: number;
  readonly vacio: number;
  readonly texto: number;
}

/** How everything was before a step, for "Atrás". */
export interface PlacementPhoto {
  readonly list: string;
  readonly counts: PlacedCounts;
  readonly approx: readonly string[];
  readonly skipped: number;
}

export type PlacementMode = "preview" | "steps";
export type StepDone = "placed" | "skipped";

export interface PlacementView {
  readonly data: SavedSetData;
  readonly name: string;
  readonly mode: PlacementMode;
  readonly isBusy: boolean;
  /** The order the things go in. */
  readonly order: readonly number[];
  readonly places: readonly ItemPlace[];
  readonly index: number;
  /** The picture it was prepared on: if it changes, the placement is cut. */
  readonly art: string;
  readonly scale: number;
  readonly failedLogos: ReadonlySet<string>;
  /** What was there before applying: it gets replaced, never what this one just put. */
  readonly before: ReadonlySet<string>;
  readonly counts: PlacedCounts;
  readonly approx: readonly string[];
  readonly skipped: number;
  readonly photos: readonly PlacementPhoto[];
  readonly done: readonly StepDone[];
  readonly used: readonly (ItemPlace | undefined)[];
  readonly firstPhoto: PlacementPhoto | null;
}

export const NO_COUNTS: PlacedCounts = { franja: 0, logo: 0, vacio: 0, texto: 0 };

export function isAtTheEnd({ index, order }: PlacementView): boolean {
  return index >= order.length;
}

export function itemNow({ data, order, index }: PlacementView): SavedItem | undefined {
  return data.items[order[index] ?? -1];
}

export function placeNow({ places, order, index }: PlacementView): ItemPlace | undefined {
  return places[order[index] ?? -1];
}

/** A change is told by its place and what it is, not by the object: Atrás makes the list again. */
export function changeKey(change: PlacedChange): string {
  return [
    Math.round(change.ox),
    Math.round(change.oy),
    Math.round(change.ow),
    Math.round(change.oh),
    change.img ?? "",
    change.tipo ?? "",
    change.franja ?? "",
    change.franjaBase ? 1 : 0,
    change.texto ?? "",
  ].join("|");
}

function sortWeight({ tipo }: SavedItem): number {
  if (tipo === "franja") return 0;
  return tipo === "texto" ? 2 : 1;
}

function topOf(item: SavedItem): number {
  return item.tipo === "franja" ? item.rect.y : item.lugar.y;
}

/** First the strips, then the logos from top to bottom, and the texts last. */
export function orderOf(items: readonly SavedItem[]): readonly number[] {
  return items
    .map((_item, index) => index)
    .toSorted((one, other) => {
      const [a, b] = [items[one], items[other]];
      if (!a || !b) return 0;
      return sortWeight(a) - sortWeight(b) || topOf(a) - topOf(b);
    });
}

function word(count: number, one: string, many: string): string {
  return count ? `${String(count)}${count === 1 ? one : many}` : "";
}

/** "1 franja, 2 logos": what was put so far. */
export function doneText({ franja, logo, vacio, texto }: PlacedCounts): string {
  return [
    word(franja, " franja", " franjas"),
    word(logo, " logo", " logos"),
    word(vacio, " lugar vacío", " lugares vacíos"),
    word(texto, " texto", " textos"),
  ]
    .filter(Boolean)
    .join(", ");
}

export interface PlacementTallies {
  readonly expired: number;
  readonly outOfProvince: number;
  readonly province: string;
}

/** What is said when it ends. */
export function finalText(view: PlacementView, tallies: PlacementTallies): string {
  const { name, counts, skipped, approx } = view;
  const { expired, outOfProvince, province } = tallies;
  const done = doneText(counts);
  const parts = [
    `Listo «${name}»${done ? `: ${done}` : ": no se puso nada"}.`,
    word(skipped, " salteado.", " salteados."),
    word(expired, " marca vencida (en rojo).", " marcas vencidas (en rojo)."),
    outOfProvince
      ? `${word(outOfProvince, " marca sin promo en ", " marcas sin promo en ")}${province} (en amarillo).`
      : "",
    approx.length > 0
      ? `Revisá: ${approx.slice(0, 2).join(", ")}${approx.length > 2 ? "…" : ""}.`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** What the step asks for, as it is said over the flyer. */
export function hintOf(item: SavedItem, isSure: boolean): string {
  if (item.tipo === "franja") {
    return isSure
      ? "Te marqué dónde iría. Si no es ahí, tocá la franja correcta o arrastrá un recuadro alrededor."
      : "No la encontré segura: tocá la franja donde va o arrastrá un recuadro alrededor.";
  }
  if (item.tipo === "vacio") {
    return isSure
      ? "Te marqué cuál se saca. Si no es ese, tocá el logo que querés sacar."
      : "No lo encontré seguro: tocá el logo que querés sacar.";
  }
  if (item.tipo === "texto")
    return "Te marqué dónde iría. Si no es ahí, arrastrá un recuadro donde va.";
  return isSure
    ? "Te marqué dónde iría. Si no es ahí, tocá el logo que querés reemplazar."
    : "No lo encontré seguro: tocá el logo que querés reemplazar.";
}

export type DotState = "ok" | "skipped" | "now" | "doubtful" | "";

export interface StepDot {
  readonly state: DotState;
  readonly label: string;
}

/** Done (green), skipped (gray), the one of now, and those missing (yellow = placed together). */
export function dotsOf(view: PlacementView): readonly StepDot[] {
  const { order, index, done, data, places } = view;
  return order.map((itemIndex, step) => {
    const name = data.items[itemIndex]?.nombre ?? "";
    const isSure = places[itemIndex]?.ok;
    const position = `${String(step + 1)}. ${name}`;
    if (step < index) {
      const wasSkipped = done[step] === "skipped";
      return {
        state: wasSkipped ? "skipped" : "ok",
        label: `${position}${wasSkipped ? " (salteado)" : " (puesto)"} · tocá para volver a este paso`,
      };
    }
    if (step === index) return { state: "now", label: `${position} (ahora)` };
    return {
      state: isSure ? "" : "doubtful",
      label: `${position}${isSure ? "" : " (lo ubicamos juntos)"} · tocá para hacerlo ahora`,
    };
  });
}

/** "Poner de una": the things left that were found for sure. */
export function sureLeft({ order, index, places }: PlacementView): number {
  return order.slice(index).filter((itemIndex) => places[itemIndex]?.ok).length;
}
