// Where a promotion is valid. The catalog is national: a promotion can be running and have no store
// in the zone of the advisor, and that brand is of no use for her flyer.
import { isModoPromotion, type Promotion } from "./promotion.ts";
import { normalizeText, rememberedText, titleCase } from "./text.ts";

/** Several provinces travel as one text, in the order of the list: "BUENOS AIRES;CAPITAL FEDERAL". */
export const PROVINCE_SEPARATOR = ";";

const LOCALITY_MEMORY_LIMIT = 20_000;
const MIN_CONTAINED_LENGTH = 4;
const CAPITAL = "CAPITAL FEDERAL";
const NAMES_OF_CAPITAL = /^(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES|BUENOS AIRES)$/;
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  GRAL: "GENERAL",
  ALTE: "ALMIRANTE",
  PTE: "PRESIDENTE",
  CNEL: "CORONEL",
  STA: "SANTA",
  STO: "SANTO",
  PDO: "PARTIDO",
  CDAD: "CIUDAD",
  DR: "DOCTOR",
  TTE: "TENIENTE",
  ING: "INGENIERO",
  CMTE: "COMANDANTE",
  "3": "TRES",
  "9": "NUEVE",
  "25": "VEINTICINCO",
};

export interface ProvinceLocation {
  readonly nombre: string;
  readonly localidades: readonly string[];
}

type WithGeography = Promotion & { readonly provincias: readonly string[] };

/** A list with names, an EMPTY list (it is bought online) and null (never worked out) differ. */
export function hasKnownGeography(
  promotion: Promotion | null | undefined,
): promotion is WithGeography {
  return Array.isArray(promotion?.provincias);
}

export function isOnlinePromotion(promotion: Promotion | null | undefined): boolean {
  return hasKnownGeography(promotion) && promotion.provincias.length === 0;
}

export function provinceList(value: string | null | undefined): string[] {
  return (value ?? "").split(PROVINCE_SEPARATOR).filter(Boolean);
}

export function hasSeveralProvinces(value: string | null | undefined): boolean {
  return provinceList(value).length > 1;
}

/** "Buenos Aires, Capital Federal y Córdoba". */
export function provincesName(value: string | null | undefined): string {
  const names = provinceList(value).map(titleCase);
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")} y ${last}`;
}

/** What was chosen that still exists on the list: a province that left it falls off. */
export function validProvinces(
  value: string | null | undefined,
  provinces: readonly string[],
): string {
  return provinceList(value)
    .filter((province) => provinces.includes(province))
    .join(PROVINCE_SEPARATOR);
}

/**
 * MODO does not publish the stores of some promotions: with a province chosen they do not show,
 * only with all of them (a decision of the owner: an advisor of the south saw supermarkets from
 * elsewhere). Galicia is not punished for not having the data.
 */
export function isInProvince(promotion: Promotion, province: string | null | undefined): boolean {
  if (!province) return true;
  if (province.includes(PROVINCE_SEPARATOR)) {
    return provinceList(province).some((one) => isInProvince(promotion, one));
  }
  if (!hasKnownGeography(promotion)) return !isModoPromotion(promotion);
  if (promotion.provincias.length === 0) return true;
  const wanted = normalizeText(province);
  return promotion.provincias.some((name) => normalizeText(name) === wanted);
}

const normalizedLocality = rememberedText(
  (text) =>
    normalizeText(text)
      .toUpperCase()
      .split(" ")
      .map((word) => ABBREVIATIONS[word] ?? word)
      .join(" "),
  LOCALITY_MEMORY_LIMIT,
);

function containsWords(text: string, words: string): boolean {
  return words.length >= MIN_CONTAINED_LENGTH && ` ${text} `.includes(` ${words} `);
}

/**
 * MODO writes the cities its own way: "TUCUMAN" for "SAN MIGUEL DE TUCUMAN", "GRAL ROCA", "CABA".
 * They are compared with the abbreviations expanded and with one inside the other, whole words.
 */
export function localityMatches(
  localityOfGalicia: string,
  city: string,
  normalizedProvince: string,
): boolean {
  const locality = normalizedLocality(localityOfGalicia);
  const town = normalizedLocality(city);
  if (!locality || !town) return false;
  if (locality === town) return true;
  if (normalizedProvince === CAPITAL && NAMES_OF_CAPITAL.test(town)) return true;
  return containsWords(locality, town) || containsWords(town, locality);
}

function modoStoreIsIn(store: string, province: string, locality: string): boolean {
  const [storeProvince = "", city = ""] = store.split("|");
  return (
    normalizedLocality(storeProvince) === province && localityMatches(locality, city, province)
  );
}

/**
 * Those of Galicia are asked to Galicia (ids); those of MODO bring their stores. Online ones are of
 * no locality, and without the data a promotion is not punished.
 */
export function isInLocality(
  promotion: Promotion,
  province: string,
  locality: string,
  idsInLocality: ReadonlySet<string> | null,
): boolean {
  if (!locality || isOnlinePromotion(promotion)) return true;
  if (!isModoPromotion(promotion)) return !idsInLocality || idsInLocality.has(String(promotion.id));
  const stores = promotion.localidades ?? [];
  if (stores.length === 0) return true;
  const wanted = normalizedLocality(province);
  return stores.some((store) => modoStoreIsIn(store, wanted, locality));
}

const namesMemory = new WeakMap<readonly string[], readonly string[]>();

/** The names of its provinces, sorted. Remembered: the filters ask for them on every key. */
export function provinceNamesOf(promotion: WithGeography): readonly string[] {
  const known = namesMemory.get(promotion.provincias);
  if (known) return known;
  const names = promotion.provincias.map(titleCase).toSorted();
  namesMemory.set(promotion.provincias, names);
  return names;
}

/** The whole text of "Dónde": what the filter reads, even if the cell shows it short. */
export function whereText(promotion: Promotion | null | undefined): string {
  if (!hasKnownGeography(promotion)) return "";
  if (promotion.provincias.length === 0) return "Online";
  return provinceNamesOf(promotion).join(", ");
}

/** A catalog without geography (never updated with it) cannot filter by province. */
export function catalogHasGeography(catalog: readonly Promotion[]): boolean {
  return catalog.some(hasKnownGeography);
}

function isLocation(value: unknown): value is { nombre: string; localidades?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "nombre" in value &&
    typeof value.nombre === "string"
  );
}

function namesIn(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((name) => typeof name === "string") : [];
}

/** The master list of Galicia, read tolerantly: `ubicaciones` is whatever the base has. */
export function locationsIn(saved: unknown): ProvinceLocation[] {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(isLocation)
    .map(({ nombre, localidades }) => ({ nombre, localidades: namesIn(localidades) }));
}

/** The master list, or the provinces seen on the promotions while there is no list. */
export function knownProvinces(
  locations: readonly ProvinceLocation[],
  catalog: readonly Promotion[],
): string[] {
  if (locations.length > 0) return locations.map(({ nombre }) => nombre).filter(Boolean);
  const seen = new Set(catalog.flatMap(({ provincias }) => provincias ?? []));
  return [...seen].toSorted();
}

export function localitiesOfProvince(
  locations: readonly ProvinceLocation[],
  province: string,
): readonly string[] {
  return locations.find(({ nombre }) => nombre === province)?.localidades ?? [];
}
