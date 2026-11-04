import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SUPABASE_URL } from "./users.ts";

const DATA_DIR = fileURLToPath(new URL("../../../fixtures/data/", import.meta.url));

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(DATA_DIR + file, "utf8")) as T;
}

export const flyerImageBytes = readFileSync(`${DATA_DIR}op9.jpg`);

/** Public address of a file in the flyers bucket. */
export function bucketUrl(file: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/flyers/${file}`;
}

export interface ActiveFlyerFile {
  name: string;
  imageUrl: string | null;
  cfg?: Record<string, unknown>;
  [key: string]: unknown;
}

export function activeFlyerNine(): ActiveFlyerFile {
  return { ...readJson<ActiveFlyerFile>("active9.json"), imageUrl: bucketUrl("flyer_t9.jpg?v=1") };
}

interface SnapshotPromo {
  id: number;
  titulo: string;
  subtitulo: string;
  imagen: string;
  fechaHasta?: string;
  tipoPromocion: string;
  proximamente?: boolean;
  leyendaDiasAplicacion?: string;
  promocion?: string;
}

/** Row of promos_galicia_cache. */
export interface PromotionRow {
  id: number;
  titulo: string;
  subtitulo: string;
  imagen: string;
  fecha_hasta: string | null;
  tipo_promocion: string;
  provincias: unknown[] | null;
  primera_vez: string;
  proximamente: boolean;
  fecha_desde: string | null;
  dias: string | null;
  beneficio: string | null;
}

interface Geography {
  prov: Record<string, unknown>;
  ubic: unknown[];
}

const geography = readJson<Geography>("geo.json");

function toPromotionRow(promo: SnapshotPromo): PromotionRow {
  const provinces = geography.prov[String(promo.id)];
  return {
    id: promo.id,
    titulo: promo.titulo,
    subtitulo: promo.subtitulo,
    imagen: promo.imagen,
    fecha_hasta: (promo.fechaHasta ?? "").slice(0, 10) || null,
    tipo_promocion: promo.tipoPromocion,
    provincias: Array.isArray(provinces) ? provinces : null,
    primera_vez: "2026-01-01",
    proximamente: Boolean(promo.proximamente),
    fecha_desde: null,
    dias: (promo.leyendaDiasAplicacion ?? "").trim() || null,
    beneficio: (promo.promocion ?? "").trim() || null,
  };
}

/** Read-only for every test, so the worker parses the snapshot just once. */
export const promotionCatalog: readonly PromotionRow[] = readJson<{
  data: { list: SnapshotPromo[] };
}>("cat.json")
  .data.list.map(toPromotionRow)
  .toSorted((a, b) => a.id - b.id);

export const locations: readonly unknown[] = geography.ubic;

export const localityPromotionIds: readonly unknown[] = existsSync(`${DATA_DIR}loc_ids.json`)
  ? readJson<unknown[]>("loc_ids.json")
  : [];
