// Config → Legales: one legal text per option, with chips that paste the markers the flyer fills in.
// Writing them by hand invites a typo nobody notices (the marker would end up printed on the flyer).
import { htmlBoldToMarks } from "@/shared/domain/legal-markup.ts";

/** The markers, explained in plain words. Those saved in the bucket keep working: none is renamed. */
export const LEGAL_MARKERS: readonly (readonly [string, string])[] = [
  ["{empresa}", "el nombre de la empresa que se carga en el flyer"],
  ["{eminentblack}", "el monto de Eminent Black: es el que sale en naranja en el Flyer Sueldo"],
  ["{platinum}", "el monto de Eminent Platinum de la configuración elegida"],
  ["{plusgold}", "el monto de Plus Gold de la configuración elegida"],
  ["{plus}", "el monto de Plus de la configuración elegida"],
  ["{importe}", "el tope de reintegro cargado (Flyer Rubros)"],
  ["{importe2}", "el segundo tope (Flyer Rubros, cuadro «Ambos»)"],
  ["{total}", "la suma de los dos topes"],
];

export interface Inserted {
  readonly text: string;
  /** Where the cursor goes, right after what was put in. */
  readonly cursor: number;
}

/**
 * What goes in at a place of the text. A place out of it (the field was never touched) is the end,
 * never the beginning. Slices, not a replace: a `$'` in the text must stay as it is (invariant 14).
 */
export function insertedAt(text: string, place: number | null, piece: string): Inserted {
  const at = place !== null && place >= 0 && place <= text.length ? place : text.length;
  return { text: text.slice(0, at) + piece + text.slice(at), cursor: at + piece.length };
}

/** What is pasted with its format: the bold of the source as **marks**, in place of the selection. */
export function pastedWithBold(text: string, start: number, end: number, html: string): Inserted {
  const marks = htmlBoldToMarks(html);
  return { text: text.slice(0, start) + marks + text.slice(end), cursor: start + marks.length };
}

export function markerPastedText(marker: string): string {
  return `Pegé ${marker} — se reemplaza solo al armar el flyer`;
}

export function legalSavedText(label: string): string {
  return `✅ Guardado. Se aplica a ${label} para todos los usuarios.`;
}
