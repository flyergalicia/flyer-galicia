// The window of a card: its fields, and what saving checks before writing.
import { isHttps } from "./offers.ts";
import type { PremiumCard } from "./rows.ts";

export type CardFieldKind = "text" | "number" | "area";

export interface CardField {
  readonly key: keyof CardTexts;
  readonly label: string;
  readonly kind: CardFieldKind;
}

/** What the window writes, as typed. The keys are the columns. */
export interface CardTexts {
  readonly banco: string;
  readonly confianza: string;
  readonly tarjeta: string;
  readonly paquete: string;
  readonly pases_anio: string;
  readonly orden: string;
  readonly salas_vip: string;
  readonly fast_pass: string;
  readonly acompanantes: string;
  readonly parking: string;
  readonly seguros: string;
  readonly puntos: string;
  readonly costo: string;
  readonly vigencia: string;
  readonly fuente_url: string;
  readonly notas: string;
}

export const CARD_FIELDS: readonly CardField[] = [
  { key: "tarjeta", label: "Tarjeta", kind: "text" },
  { key: "paquete", label: "Paquete o programa", kind: "text" },
  { key: "pases_anio", label: "Pases a salas VIP por año (titular)", kind: "number" },
  { key: "orden", label: "Orden dentro del banco", kind: "number" },
  { key: "salas_vip", label: "Salas VIP (detalle)", kind: "area" },
  { key: "fast_pass", label: "Fast Pass", kind: "area" },
  { key: "acompanantes", label: "Acompañantes y adicionales", kind: "area" },
  { key: "parking", label: "Parking", kind: "area" },
  { key: "seguros", label: "Seguros y asistencia", kind: "area" },
  { key: "puntos", label: "Millas y puntos", kind: "area" },
  { key: "costo", label: "Costo y cómo bonificarlo", kind: "area" },
  { key: "vigencia", label: "Vigencia o cambios anunciados", kind: "text" },
  { key: "fuente_url", label: "Dirección de la página (https://…)", kind: "text" },
  { key: "notas", label: "Notas", kind: "area" },
];

/** Whether a field takes the whole width of the window. */
export function isWideField({ key, kind }: CardField): boolean {
  return kind === "area" || key === "fuente_url" || key === "vigencia";
}

function asText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** What the window starts with: the card, or a new one of Galicia. */
export function cardTexts(card: PremiumCard | null): CardTexts {
  const from = card ?? {
    banco: "galicia",
    tarjeta: "",
    paquete: "",
    orden: 0,
    confianza: "oficial",
  };
  return {
    banco: from.banco,
    confianza: asText(from.confianza),
    tarjeta: asText(from.tarjeta),
    paquete: asText(from.paquete),
    pases_anio: asText(card?.pases_anio),
    orden: asText(from.orden),
    salas_vip: asText(card?.salas_vip),
    fast_pass: asText(card?.fast_pass),
    acompanantes: asText(card?.acompanantes),
    parking: asText(card?.parking),
    seguros: asText(card?.seguros),
    puntos: asText(card?.puntos),
    costo: asText(card?.costo),
    vigencia: asText(card?.vigencia),
    fuente_url: asText(card?.fuente_url),
    notas: asText(card?.notas),
  };
}

/** What is written to promos_bench_tarjetas: every field trimmed, the numbers as numbers. */
export interface CardWrite extends Omit<CardTexts, "pases_anio" | "orden"> {
  readonly pases_anio: number | null;
  readonly orden: number;
  readonly revisada: string;
}

export type CardCheck =
  | { readonly ok: true; readonly row: CardWrite }
  | { readonly ok: false; readonly problem: string };

function trimmed(texts: CardTexts): CardTexts {
  return {
    banco: texts.banco.trim(),
    confianza: texts.confianza.trim(),
    tarjeta: texts.tarjeta.trim(),
    paquete: texts.paquete.trim(),
    pases_anio: texts.pases_anio.trim(),
    orden: texts.orden.trim(),
    salas_vip: texts.salas_vip.trim(),
    fast_pass: texts.fast_pass.trim(),
    acompanantes: texts.acompanantes.trim(),
    parking: texts.parking.trim(),
    seguros: texts.seguros.trim(),
    puntos: texts.puntos.trim(),
    costo: texts.costo.trim(),
    vigencia: texts.vigencia.trim(),
    fuente_url: texts.fuente_url.trim(),
    notas: texts.notas.trim(),
  };
}

/** On saving it stays as reviewed today. */
export function checkCard(texts: CardTexts, today: string): CardCheck {
  const row = trimmed(texts);
  if (!row.tarjeta) return { ok: false, problem: "Falta el nombre de la tarjeta." };
  if (row.fuente_url && !isHttps(row.fuente_url)) {
    return { ok: false, problem: "La dirección de la página tiene que empezar con https://" };
  }
  const passes = row.pases_anio === "" ? null : Math.max(0, Math.round(Number(row.pases_anio)));
  if (passes !== null && Number.isNaN(passes)) {
    return { ok: false, problem: "Los pases tienen que ser un número." };
  }
  return {
    ok: true,
    row: { ...row, pases_anio: passes, orden: Math.round(Number(row.orden)) || 0, revisada: today },
  };
}
