// Marcas vigiladas: `_vigilar.json`, one list per flyer option. The administrator loads them from
// Promociones → Buscar, Estudio adds those of a published design, and each day the Edge Function
// looks at them and sends a mail if one has expired.

export interface WatchedBrand {
  /** As it was pasted. */
  readonly m?: string;
  /** Its title on the catalog. */
  readonly t?: string;
  readonly img?: string;
  readonly origen?: string;
}

export interface WatchedBrandsFile {
  readonly opciones: Readonly<Record<string, readonly WatchedBrand[]>>;
  readonly updated_at?: string;
}

const STUDIO_ORIGIN = "estudio";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isWatchList(value: unknown): value is WatchedBrandsFile["opciones"] {
  return isRecord(value);
}

/** Whatever the file has: without the lists, it has none. */
export function watchedBrandsIn(file: unknown): WatchedBrandsFile {
  if (!isRecord(file) || !isWatchList(file.opciones)) return { opciones: {} };
  return { ...file, opciones: file.opciones };
}

/**
 * The list of an option with what was found on Buscar. It replaces what was loaded by hand; those
 * added from Estudio stay. A logo goes only once.
 */
export function withBrandsFound(
  file: WatchedBrandsFile,
  option: number,
  found: readonly WatchedBrand[],
): WatchedBrandsFile {
  const fromStudio = (file.opciones[String(option)] ?? []).filter(
    ({ origen }) => origen === STUDIO_ORIGIN,
  );
  const logos = new Set<string>();
  const list: WatchedBrand[] = [];
  for (const brand of found) {
    const logo = brand.img ?? "";
    if (logo && logos.has(logo)) continue;
    logos.add(logo);
    list.push(brand);
  }
  for (const brand of fromStudio) {
    if (brand.img && logos.has(brand.img)) continue;
    logos.add(brand.img ?? "");
    list.push(brand);
  }
  return { ...file, opciones: { ...file.opciones, [String(option)]: list } };
}

/** One change of a design, as far as watching its brands goes. */
export interface DesignBrand {
  readonly tipo?: string | undefined;
  readonly img?: string | undefined;
  readonly t?: string | undefined;
}

function isCatalogLogo({ tipo, img }: DesignBrand): boolean {
  return tipo !== "txt" && Boolean(img) && !img?.startsWith("pc:") && !img?.startsWith("orig:");
}

/**
 * Publishing a design: the option it is born as watches what its base watched by hand, and the logos of
 * Promociones of the design, once each. The logos of the PC and those of the flyer itself are not
 * brands of the catalog. Null: there is nothing to watch.
 */
export function withDesignBrands(
  file: WatchedBrandsFile,
  base: number,
  created: number,
  changes: readonly DesignBrand[],
): WatchedBrandsFile | null {
  const list = (file.opciones[String(base)] ?? []).filter(({ origen }) => origen !== STUDIO_ORIGIN);
  const seen = new Set(list.flatMap(({ img }) => (img ? [img] : [])));
  const all = [...list];
  for (const change of changes) {
    const img = change.img ?? "";
    if (isCatalogLogo(change) && !seen.has(img)) {
      seen.add(img);
      all.push({ m: change.t ?? "", t: change.t ?? "", img, origen: STUDIO_ORIGIN });
    }
  }
  return all.length > 0
    ? { ...file, opciones: { ...file.opciones, [String(created)]: all } }
    : null;
}
