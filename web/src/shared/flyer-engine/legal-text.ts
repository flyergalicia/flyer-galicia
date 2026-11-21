// The legal text: its markers and which parts go in bold.
import { amountOf, largestAmount, sumAmounts } from "./amounts.ts";
import { type FlyerScene, type FlyerValues } from "./types.ts";

export interface TextSegment {
  text: string;
  bold: boolean;
}

const FIXED_BOLD_PHRASES = [
  "(1) Promoción del 100% de ahorro.",
  "(2) Bonificación de comisiones.",
  "(3) Promoción en supermercados.",
  "(4) Promoción en combustibles.",
  "(5) Promociones Galicia.",
  "(6) Referidos.",
  "(7) Corresponsalias.",
  "(8) Préstamos.",
  "Bonificación de la comisión por mantenimiento del Servicio Galicia por 6 meses para nuevos clientes.",
  "Bonificación de la comisión por mantenimiento del Servicio Galicia para clientes de Banco Galicia.",
  "PARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN:",
];

const MARKER = /\{\s*([A-Za-z0-9]+(?:[ _]+[A-Za-z0-9]+)*)\s*\}( ?)/g;

function firstPhrase(text: string, phrases: readonly string[]): { at: number; phrase: string } {
  let at = -1;
  let phrase = "";
  for (const candidate of phrases) {
    const index = candidate ? text.indexOf(candidate) : -1;
    if (index >= 0 && (at < 0 || index < at)) {
      at = index;
      phrase = candidate;
    }
  }
  return { at, phrase };
}

/** It cuts at the phrase that comes first in the text, so what is before it keeps its own bold. */
function splitAtPhrases(text: string, phrases: readonly string[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const { at, phrase } = firstPhrase(remaining, phrases);
    if (at < 0) {
      segments.push({ text: remaining, bold: false });
      break;
    }
    if (at > 0) segments.push({ text: remaining.slice(0, at), bold: false });
    segments.push({ text: `${phrase} `, bold: true });
    remaining = remaining.slice(at + phrase.length).replace(/^\s+/, "");
  }
  return segments;
}

/** `**bold**` written by hand plus the fixed phrases of the legal texts of the bank. */
export function splitBold(text: string): TextSegment[] {
  const written: string[] = [];
  const clean = text.replaceAll(/\*\*([\s\S]+?)\*\*/g, (_match, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed) written.push(trimmed);
    return inner;
  });
  return splitAtPhrases(clean, [...written, ...FIXED_BOLD_PHRASES]);
}

function markerValues(values: FlyerValues, scene: FlyerScene): ReadonlyMap<string, string> {
  return new Map([
    ["importe", values.importe ?? ""],
    ["importe2", values.importe2 || values.importe || ""],
    ["total", sumAmounts(values.importe, values.importe2 || values.importe)],
    ["empresa", values.empresa ?? ""],
    // An old alias of {empresa}.
    ["nombre", values.empresa ?? ""],
    ["cashback", largestAmount(values, scene)],
    ["eminentblack", amountOf(values, 1, scene)],
    ["platinum", amountOf(values, 2, scene)],
    ["plusgold", amountOf(values, 3, scene)],
    ["plus", amountOf(values, 4, scene)],
  ]);
}

/**
 * Replaces the markers ("{Plus Gold}" and "{plusgold}" are the same one). A marker with no value goes
 * away with the space after it; one that is not in the table stays, because a legal text can have
 * braces on purpose. The stored text keeps its markers.
 */
export function legalWithValues(
  text: string | null | undefined,
  values: FlyerValues,
  scene: FlyerScene,
): string {
  const legal = text ?? "";
  if (!legal.includes("{")) return legal;
  const known = markerValues(values, scene);
  return legal.replaceAll(MARKER, (match, name: string, space: string) => {
    const value = known.get(name.toLowerCase().replaceAll(/[\s_]+/g, ""));
    if (value === undefined) return match;
    return value ? value + space : "";
  });
}
