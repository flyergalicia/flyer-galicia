// What the Excel carries: the same numbers as the screen, with its filters and reference purchases.
import { provincesName, titleCase } from "@/shared/domain/promotions/index.ts";
import { validOnDay, WEEKDAYS } from "./dates.ts";
import type { Audience, BenchFilters, BrandIndex } from "./filters.ts";
import { placesOf } from "./filters.ts";
import { audienceText, bestOf, isTopValue, mostInstallments, type Offer } from "./offers.ts";
import { type ReferencePurchases, REFERENCE_FIELDS, referenceOf } from "./reference.ts";
import { BANKS, type BenchPromotion, groupBy, type PremiumCard, type SourceMeta } from "./rows.ts";
import { TRUST_TEXT } from "./cards.ts";

export type Cell = string | number | null | undefined;

function sortedGroups(list: readonly BenchPromotion[], keyOf: (row: BenchPromotion) => string) {
  return [...groupBy(list, keyOf).entries()].toSorted(([one], [other]) =>
    one < other ? -1 : Number(one > other),
  );
}

export function rowsByRubro(list: readonly BenchPromotion[], references: ReferencePurchases) {
  return sortedGroups(list, (row) => String(row.rubro)).flatMap(([rubro, rows]) => {
    const byBank = groupBy(rows, (row) => row.banco ?? "");
    return BANKS.map(({ code, name }) => {
      const ofBank = byBank.get(code) ?? [];
      const best = bestOf(ofBank, references);
      const installments = mostInstallments(ofBank);
      return {
        rubro,
        compra: referenceOf(references, rubro),
        banco: name,
        promos: ofBank.length,
        devuelve: best ? best.value : null,
        pct: best ? best.row.pct : null,
        marca: best ? best.row.titulo : "",
        tope: best && (best.row.tope ?? 0) > 0 ? best.row.tope : null,
        dias: best ? best.row.dias : "",
        cuotas: installments ? installments.cuotas : null,
        marcaCuotas: installments ? installments.titulo : "",
      };
    });
  });
}

function brandSheetRow(name: string | null | undefined, offer: Offer, bank: string, top: number) {
  const { row, value } = offer;
  return {
    marca: name,
    rubro: row.rubro,
    banco: bank,
    devuelve: value,
    pct: row.pct,
    tope: (row.tope ?? 0) > 0 ? row.tope : null,
    dias: row.dias,
    segmento: audienceText(row),
    gana: isTopValue(offer, top) ? "Sí" : "",
  };
}

/** Only the brands that can be compared: at least two banks. */
export function rowsByBrand(list: readonly BenchPromotion[], references: ReferencePurchases) {
  const withBrand = list.filter((row) => row.marca_clave);
  return sortedGroups(withBrand, (row) => row.marca_clave ?? "").flatMap(([, rows]) => {
    const byBank = groupBy(rows, (row) => row.banco ?? "");
    const offers = BANKS.map(({ code, name }) => ({
      name,
      offer: bestOf(byBank.get(code) ?? [], references),
    }));
    const present = offers.filter(({ offer }) => offer !== null);
    if (present.length < 2) return [];
    const top = Math.max(0, ...present.map(({ offer }) => offer?.value ?? 0));
    return present.flatMap(({ name, offer }) =>
      offer ? [brandSheetRow(rows[0]?.titulo, offer, name, top)] : [],
    );
  });
}

export function rowsByDay(list: readonly BenchPromotion[], references: ReferencePurchases) {
  const byBank = groupBy(list, (row) => row.banco ?? "");
  return WEEKDAYS.flatMap((dia, day) =>
    BANKS.map(({ code, name }) => {
      const best = bestOf(
        (byBank.get(code) ?? []).filter((row) => validOnDay(row.dias_n, day)),
        references,
      );
      return {
        dia,
        banco: name,
        devuelve: best ? best.value : null,
        pct: best ? best.row.pct : null,
        marca: best ? best.row.titulo : "",
        rubro: best ? best.row.rubro : "",
      };
    }),
  );
}

export function rowsOfCards(cards: readonly PremiumCard[]) {
  return cards.map((card) => ({
    banco: BANKS.find(({ code }) => code === card.banco)?.name ?? card.banco,
    tarjeta: card.tarjeta,
    paquete: card.paquete,
    pases: card.pases_anio,
    salas: card.salas_vip,
    fast: card.fast_pass,
    acomp: card.acompanantes,
    parking: card.parking,
    seguros: card.seguros,
    puntos: card.puntos,
    costo: card.costo,
    vigencia: card.vigencia,
    fuente: card.fuente_url,
    conf: TRUST_TEXT[card.confianza ?? ""] ?? "",
    rev: card.revisada || "",
    notas: card.notas,
  }));
}

const PER_PERIOD: Readonly<Record<string, string>> = {
  month: "mes",
  week: "semana",
  day: "día",
  transaction: "compra",
};
const AUDIENCES: Readonly<Record<string, string>> = {
  premium: "Premium",
  clasico: "Clásico / Gold",
};

function sourceName(source: string | null | undefined): string {
  if (source === "manual") return "Cargada a mano";
  return source === "modo" || !source ? "MODO" : "Web propia";
}

function placesText(row: BenchPromotion, brands: BrandIndex): string {
  const places = placesOf(row, brands);
  if (places === null) return "Sin dato";
  return places.length > 0 ? places.map(titleCase).join(", ") : "Todo el país (online)";
}

function cardsText(row: BenchPromotion): string {
  return [row.credito ? "Crédito" : "", row.debito ? "Débito" : ""].filter(Boolean).join(" y ");
}

export function rowsOfPromotions(list: readonly BenchPromotion[], brands: BrandIndex) {
  return list.map((row) => ({
    banco: BANKS.find(({ code }) => code === row.banco)?.name ?? row.banco,
    fuente: sourceName(row.fuente),
    marca: row.titulo,
    rubro: row.rubro,
    beneficio: row.beneficio || "",
    pct: row.pct,
    tope: (row.tope ?? 0) > 0 ? row.tope : null,
    por: PER_PERIOD[row.tope_por ?? ""] ?? "",
    cuotas: row.cuotas || null,
    dias: row.dias || "",
    tarjetas: cardsText(row),
    segmento: AUDIENCES[row.segmento ?? ""] ?? "",
    provincias: placesText(row, brands),
    desde: row.fecha_desde || "",
    hasta: row.fecha_hasta || "",
  }));
}

const AUDIENCE_FILTER: Readonly<Record<Audience, string>> = {
  todos: "Todas",
  clasico: "Clásico / Gold",
  premium: "Premium",
};

function sourceLine(
  name: string,
  modo: SourceMeta | undefined,
  website: SourceMeta | undefined,
): Cell[] {
  const read = modo?.last_sync_at
    ? new Date(modo.last_sync_at).toLocaleDateString("es-AR")
    : "sin datos";
  return [name, `MODO${website ? " + web propia" : ""} · ${read}`];
}

/** The first sheet: the filters, the reference purchases and the sources, line by line. */
export function summaryLines(
  filters: BenchFilters,
  references: ReferencePurchases,
  meta: readonly SourceMeta[],
  generated: Date,
): Cell[][] {
  const byBank = new Map(meta.map((entry) => [entry.banco, entry]));
  return [
    ["Benchmark de promociones: Galicia contra la competencia"],
    ["Generado", generated.toLocaleString("es-AR")],
    [],
    ["Filtros de la pantalla"],
    ["Provincia", filters.prov ? provincesName(filters.prov) : "Todas las provincias"],
    ["Rubro", filters.rubro || "Todos"],
    ["Tarjeta de la persona", AUDIENCE_FILTER[filters.seg]],
    ["Tipo de tarjeta", filters.tarj],
    [],
    ["Compra de referencia (para calcular lo que devuelve)"],
    ...REFERENCE_FIELDS.map(({ rubro, label }) => [label, references[rubro]]),
    [],
    ["Fuentes y última actualización"],
    ...BANKS.map(({ code, name }) => sourceLine(name, byBank.get(code), byBank.get(`${code}_web`))),
    [],
    ["Cómo leerlo"],
    [
      "Lo que devuelve = el menor entre (compra de referencia × %) y el tope. Los topes de MODO suelen ser mensuales y se toman como no gastados.",
    ],
    [
      "Macro, Supervielle y Santander salen sólo de MODO; BBVA y Galicia suman su web propia. Revisá la promo en la web del banco antes de mostrársela a un cliente.",
    ],
  ];
}
