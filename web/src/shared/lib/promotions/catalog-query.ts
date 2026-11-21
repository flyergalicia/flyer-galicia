// The catalog of promotions: the copy of Galicia, the one of MODO and how old they are. One
// reading for the whole app: Promociones and the windows of brands look at the same data.
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  locationsIn,
  mergeModoPromotions,
  type ModoRow,
  type Promotion,
  type ProvinceLocation,
} from "@/shared/domain/promotions/index.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";

const GALICIA_COLUMNS =
  "id,titulo,subtitulo,imagen,fecha_hasta,tipo_promocion,provincias,primera_vez,proximamente,fecha_desde,dias,beneficio";

export const PROMOTION_CATALOG_QUERY_KEY = ["promotions", "catalog"] as const;

export interface CatalogMeta {
  readonly last_sync_at: string | null;
  readonly total: number;
}

export interface PromotionCatalog {
  readonly galicia: readonly Promotion[];
  /** Those of MODO that Galicia does not have. */
  readonly modo: readonly Promotion[];
  /** Galicia and MODO: what says if a logo already on a flyer is still current (invariant 26). */
  readonly all: readonly Promotion[];
  readonly meta: CatalogMeta | null;
  readonly locations: readonly ProvinceLocation[];
  /**
   * Why Galicia could not be read, with what had arrived until then. It is not an empty catalog:
   * nothing here may say there are no promotions (invariant 24).
   */
  readonly failure: string | null;
}

function messageOf(cause: unknown): string {
  const said = typeof cause === "object" && cause !== null && "message" in cause && cause.message;
  return typeof said === "string" && said ? said : String(cause);
}

async function readGalicia({ db, fetchAllRows }: Backend) {
  const answer = await fetchAllRows<Promotion>((from, to) =>
    db
      .from("promos_galicia_cache")
      .select(GALICIA_COLUMNS)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return answer.ok
    ? { rows: answer.value, failure: null }
    : { rows: answer.error.partialRows, failure: messageOf(answer.error.cause) };
}

/**
 * All the columns: a new one does not break the reading if the base does not have it yet. Without
 * the table, or if it cannot be read, Promociones goes on with Galicia alone.
 */
async function readModo({ db, fetchAllRows }: Backend): Promise<readonly ModoRow[]> {
  const answer = await fetchAllRows<ModoRow>((from, to) =>
    db.from("promos_modo_cache").select("*").order("id", { ascending: true }).range(from, to),
  );
  if (answer.ok) return answer.value;
  console.warn("promos_modo_cache:", messageOf(answer.error.cause));
  return [];
}

async function readMeta({ db }: Backend) {
  const { data } = await db
    .from("promos_galicia_meta")
    .select("last_sync_at,total,ubicaciones")
    .eq("id", 1)
    .single();
  return data;
}

async function readCatalog(backend: Backend): Promise<PromotionCatalog> {
  const [galicia, modoRows, meta] = await Promise.all([
    readGalicia(backend),
    readModo(backend),
    readMeta(backend),
  ]);
  const { modo, all } = mergeModoPromotions(galicia.rows, modoRows, new Date());
  return {
    galicia: galicia.rows,
    modo,
    all,
    meta: meta ? { last_sync_at: meta.last_sync_at, total: meta.total } : null,
    locations: locationsIn(meta?.ubicaciones),
    failure: galicia.failure,
  };
}

/** Each one reads it once; "Actualizar catálogo ahora" or an empty catalog read it again. */
export function promotionCatalogOptions(backend: Backend) {
  return queryOptions({
    queryKey: PROMOTION_CATALOG_QUERY_KEY,
    queryFn: () => readCatalog(backend),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function usePromotionCatalog(enabled = true) {
  const backend = useBackend();
  return useQuery({ ...promotionCatalogOptions(backend), enabled });
}

const NOTHING: readonly Promotion[] = [];

/** What can be seen: with or without MODO, according to its tick. */
export function shownPromotions(
  catalog: PromotionCatalog | undefined,
  includeModo: boolean,
): readonly Promotion[] {
  if (!catalog) return NOTHING;
  return includeModo ? catalog.all : catalog.galicia;
}

/** It was never updated: an empty catalog that nothing explains. */
export function catalogNeverUpdated({ galicia, meta, failure }: PromotionCatalog): boolean {
  return !failure && galicia.length === 0 && !((meta?.total ?? 0) > 0);
}

/** What the person has to hear about what has just been read; null when all went well. */
export function catalogReadNotice({ galicia, meta, failure }: PromotionCatalog): string | null {
  const total = meta?.total ?? 0;
  if (!failure && galicia.length === 0 && total > 0) {
    return `No se pudo leer el catálogo (0 resultados pero debería haber ${String(total)}). Probá recargar la página o volver a iniciar sesión.`;
  }
  if (total > 0 && galicia.length < total) {
    return `Atención: el catálogo llegó incompleto (${String(galicia.length)} de ${String(total)}). Puede que falten marcas.`;
  }
  return failure ? `No se pudo leer el catálogo de promociones: ${failure}` : null;
}
