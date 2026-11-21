// The days of a promotion, read and written as the flyer writes them.
import type { Promotion } from "./promotion.ts";
import { decodeEntities, normalizeText } from "./text.ts";

const DAY_WORDS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DAY_TEXTS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const DAY_RANGE =
  /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s? a (lunes|martes|miercoles|jueves|viernes|sabado|domingo)/;
const EVERY_DAY = /todos los dias/;

export const EVERY_DAY_TEXT = "Todos los días";

export interface ReadDays {
  readonly everyDay: boolean;
  /** 0 is Monday. */
  readonly days: ReadonlySet<number>;
}

/** The days of THAT promotion, as Galicia publishes them: "Todos los días excepto feriados". */
export function ownDays(promotion: Promotion | null | undefined): string {
  return promotion?.dias ? decodeEntities(promotion.dias).replace(/\s+/g, " ").trim() : "";
}

function addRange(days: Set<number>, from: number, to: number): void {
  for (let day = from, steps = 0; steps < DAY_WORDS.length; day = (day + 1) % 7, steps += 1) {
    days.add(day);
    if (day === to) return;
  }
}

export function readDays(text: string | null | undefined): ReadDays {
  const normalized = normalizeText(text);
  if (EVERY_DAY.test(normalized)) return { everyDay: true, days: new Set() };
  const days = new Set<number>();
  const range = DAY_RANGE.exec(normalized);
  if (range) addRange(days, DAY_WORDS.indexOf(range[1] ?? ""), DAY_WORDS.indexOf(range[2] ?? ""));
  DAY_WORDS.forEach((word, day) => {
    if (new RegExp(`\\b${word}`).test(normalized)) days.add(day);
  });
  return { everyDay: false, days };
}

/** "Viernes y sábados", as the flyer writes them. */
export function formatDays(days: ReadonlySet<number>): string {
  if (days.size === 0) return "";
  if (days.size === DAY_WORDS.length) return EVERY_DAY_TEXT;
  const texts = [...days].toSorted((a, b) => a - b).map((day) => DAY_TEXTS[day] ?? "");
  const last = texts.at(-1) ?? "";
  const written = texts.length === 1 ? last : `${texts.slice(0, -1).join(", ")} y ${last}`;
  return written.charAt(0).toUpperCase() + written.slice(1);
}

/** To compare: "Viernes y Sábado" is "Viernes y sábados". Empty: it is not known. */
export function daysSignature(text: string | null | undefined): string {
  if (!text) return "";
  const { everyDay, days } = readDays(text);
  return everyDay ? "todos" : [...days].toSorted((a, b) => a - b).join(",");
}
