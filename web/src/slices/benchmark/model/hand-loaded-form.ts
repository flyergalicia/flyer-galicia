// The window of a promotion loaded by hand: what it starts with and what saving checks.
import { handLoadedDays } from "./hand-loaded.ts";
import { isHttps } from "./offers.ts";
import type { HandLoadedPromotion } from "./rows.ts";

export const HAND_LOADED_RUBROS = [
  "Supermercados",
  "Combustible",
  "Gastronomía",
  "Salud y Bienestar",
  "Indumentaria",
  "Hogar",
  "Electrónica",
  "Entretenimiento",
  "Mascotas",
  "Vehículos",
  "Juguetes",
  "Otros",
] as const;

export const SHORT_DAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;

/** What the window holds, as typed. The keys are the columns. */
export interface HandLoadedTexts {
  readonly banco: string;
  readonly rubro: string;
  readonly titulo: string;
  readonly pct: string;
  readonly tope: string;
  readonly tope_por: string;
  readonly cuotas: string;
  readonly segmento: string;
  readonly condicion: string;
  readonly dias_n: readonly number[];
  readonly credito: boolean;
  readonly debito: boolean;
  readonly fecha_desde: string;
  readonly fecha_hasta: string;
  readonly provincias: string;
  readonly beneficio: string;
  readonly fuente_url: string;
  readonly notas: string;
}

function asText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

const NEW_PROMOTION: HandLoadedPromotion = {
  id: "",
  banco: "santander",
  titulo: "",
  rubro: "Supermercados",
  dias_n: [],
  credito: true,
  debito: true,
  segmento: null,
};

export function handLoadedTexts(promotion: HandLoadedPromotion | null): HandLoadedTexts {
  const from = promotion ?? NEW_PROMOTION;
  return {
    banco: from.banco,
    rubro: asText(from.rubro),
    titulo: asText(from.titulo),
    pct: asText(from.pct),
    tope: asText(from.tope),
    tope_por: asText(from.tope_por),
    cuotas: asText(from.cuotas),
    segmento: asText(from.segmento),
    condicion: asText(from.condicion),
    dias_n: handLoadedDays(from),
    credito: Boolean(from.credito),
    debito: Boolean(from.debito),
    fecha_desde: asText(from.fecha_desde),
    fecha_hasta: asText(from.fecha_hasta),
    provincias: (from.provincias ?? []).join(", "),
    beneficio: asText(from.beneficio),
    fuente_url: asText(from.fuente_url),
    notas: asText(from.notas),
  };
}

/** The rubros to choose from; one saved that is not among them is added. */
export function rubroChoices(current: string): string[] {
  const rubros: string[] = [...HAND_LOADED_RUBROS];
  return current && !rubros.includes(current) ? [...rubros, current] : rubros;
}

/** What is written to promos_bench_manual. */
export interface HandLoadedWrite {
  readonly banco: string;
  readonly rubro: string;
  readonly titulo: string;
  readonly pct: number | null;
  readonly tope: number | null;
  readonly tope_por: string | null;
  readonly cuotas: number;
  readonly segmento: string | null;
  readonly condicion: string;
  readonly beneficio: string;
  readonly notas: string;
  readonly fuente_url: string;
  readonly fecha_desde: string | null;
  readonly fecha_hasta: string | null;
  readonly dias_n: readonly number[];
  readonly credito: boolean;
  readonly debito: boolean;
  /** Empty: the whole country. */
  readonly provincias: readonly string[] | null;
}

export type HandLoadedCheck =
  | { readonly ok: true; readonly row: HandLoadedWrite }
  | { readonly ok: false; readonly problem: string };

function numberOrNull(typed: string): number | null {
  return typed === "" ? null : Number(typed);
}

function provincesOf(typed: string): string[] | null {
  if (!typed) return null;
  return typed
    .split(",")
    .map((province) => province.trim().toUpperCase())
    .filter(Boolean);
}

function rowOf(texts: HandLoadedTexts): HandLoadedWrite {
  const card = texts.credito || texts.debito;
  return {
    banco: texts.banco.trim(),
    rubro: texts.rubro.trim() || "Otros",
    titulo: texts.titulo.trim(),
    pct: numberOrNull(texts.pct.trim()),
    tope: numberOrNull(texts.tope.trim()),
    tope_por: texts.tope_por.trim() || null,
    cuotas: Math.max(0, Math.round(Number(texts.cuotas.trim()) || 0)),
    segmento: texts.segmento.trim() || null,
    condicion: texts.condicion.trim(),
    beneficio: texts.beneficio.trim(),
    notas: texts.notas.trim(),
    fuente_url: texts.fuente_url.trim(),
    fecha_desde: texts.fecha_desde.trim() || null,
    fecha_hasta: texts.fecha_hasta.trim() || null,
    // In the order of the week, as the boxes are.
    dias_n: texts.dias_n.toSorted((one, other) => one - other),
    // Neither ticked is both.
    credito: card ? texts.credito : true,
    debito: card ? texts.debito : true,
    provincias: provincesOf(texts.provincias.trim()),
  };
}

function isBadNumber(value: number | null, isBad: (number: number) => boolean): boolean {
  return value !== null && (Number.isNaN(value) || isBad(value));
}

function problemOf(row: HandLoadedWrite): string | null {
  if (!row.titulo) return "Falta la marca o el comercio.";
  if (row.pct === null && !row.cuotas) return "Poné el % de descuento o las cuotas sin interés.";
  if (
    isBadNumber(row.pct, (percent) => percent <= 0 || percent > 100) ||
    isBadNumber(row.tope, (cap) => cap < 0)
  ) {
    return "Revisá el % y el tope: tienen que ser números válidos.";
  }
  if (row.fuente_url && !isHttps(row.fuente_url)) {
    return "La dirección de la página tiene que empezar con https://";
  }
  if (row.fecha_desde && row.fecha_hasta && row.fecha_hasta < row.fecha_desde) {
    return 'La fecha "hasta" es anterior a "desde".';
  }
  return null;
}

export function checkHandLoaded(texts: HandLoadedTexts): HandLoadedCheck {
  const row = rowOf(texts);
  const problem = problemOf(row);
  return problem === null ? { ok: true, row } : { ok: false, problem };
}
