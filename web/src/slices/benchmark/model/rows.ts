// The rows of Benchmark as the database gives them: benchmark-sync already normalized them. The keys
// are the columns: a contract. A row may come without some of them (an old row, or one loaded by
// hand), so every field is read as possibly missing.

export interface BenchPromotion {
  readonly id?: string | null;
  readonly banco?: string | null;
  /** 'modo', the website of the bank ('bbva', 'galicia'…) or 'manual'. Missing means MODO. */
  readonly fuente?: string | null;
  readonly titulo?: string | null;
  readonly marca_clave?: string | null;
  readonly rubro?: string | null;
  readonly beneficio?: string | null;
  readonly pct?: number | null;
  readonly tope?: number | null;
  readonly tope_por?: string | null;
  readonly cuotas?: number | null;
  readonly dias?: string | null;
  /** 0 is Monday. Empty: every day. */
  readonly dias_n?: readonly number[] | null;
  readonly credito?: boolean | null;
  readonly debito?: boolean | null;
  readonly emisores?: readonly string[] | null;
  /** 'premium', 'clasico' or null (for everybody). */
  readonly segmento?: string | null;
  readonly segmento_txt?: string | null;
  /** null: not known; empty: the whole country. */
  readonly provincias?: readonly string[] | null;
  readonly fecha_desde?: string | null;
  readonly fecha_hasta?: string | null;
  readonly proximamente?: boolean | null;
  /** How many banks of MODO share it: more than one, valid with any of them. */
  readonly bancos_n?: number | null;
  readonly slug?: string | null;
  /** Only the ones loaded by hand. */
  readonly fuente_url?: string | null;
}

/** Where a brand is and its logo, read once per brand. */
export interface BenchBrand {
  readonly marca_clave: string;
  readonly provincias?: readonly string[] | null;
  readonly imagen?: string | null;
}

/** When each source was read, and how it went. */
export interface SourceMeta {
  readonly banco: string;
  readonly last_sync_at?: string | null;
  readonly error?: string | null;
}

/** A card or package with its VIP lounges: the administrator loads them by hand. */
export interface PremiumCard {
  readonly id: string;
  readonly banco: string;
  readonly tarjeta: string;
  readonly paquete?: string | null;
  readonly orden?: number | null;
  readonly pases_anio?: number | null;
  readonly salas_vip?: string | null;
  readonly fast_pass?: string | null;
  readonly acompanantes?: string | null;
  readonly parking?: string | null;
  readonly seguros?: string | null;
  readonly puntos?: string | null;
  readonly costo?: string | null;
  readonly vigencia?: string | null;
  readonly fuente_url?: string | null;
  /** 'oficial', 'nota' or 'sin_dato'. */
  readonly confianza?: string | null;
  readonly revisada?: string | null;
  readonly notas?: string | null;
}

/** A promotion the administrator loaded by hand, as the table keeps it. */
export interface HandLoadedPromotion {
  readonly id: string;
  readonly banco: string;
  readonly titulo: string;
  readonly rubro?: string | null;
  readonly beneficio?: string | null;
  readonly pct?: number | string | null;
  readonly tope?: number | string | null;
  readonly tope_por?: string | null;
  readonly cuotas?: number | null;
  readonly dias_n?: readonly (number | string)[] | null;
  readonly credito?: boolean | null;
  readonly debito?: boolean | null;
  readonly segmento?: string | null;
  readonly condicion?: string | null;
  readonly provincias?: readonly string[] | null;
  readonly fecha_desde?: string | null;
  readonly fecha_hasta?: string | null;
  readonly fuente_url?: string | null;
  readonly notas?: string | null;
  readonly updated_at?: string | null;
}

/** The banks, in the order of the columns. Galicia goes first. */
export const BANKS = [
  { code: "galicia", name: "Galicia" },
  { code: "bbva", name: "BBVA" },
  { code: "macro", name: "Macro" },
  { code: "supervielle", name: "Supervielle" },
  { code: "santander", name: "Santander" },
  { code: "icbc", name: "ICBC" },
] as const;

export type BankCode = (typeof BANKS)[number]["code"];

export const GALICIA: BankCode = "galicia";

/** The banks Galicia can be compared with. */
export const COMPETITORS = BANKS.filter(({ code }) => code !== GALICIA);

/** The name of a bank on screen; an unknown code shows as it is. */
export function bankName(code: string | null | undefined): string {
  return BANKS.find((bank) => bank.code === code)?.name ?? code ?? "";
}

/** Its position among the columns; an unknown one goes last. */
export function bankOrder(code: string | null | undefined): number {
  const index = BANKS.findIndex((bank) => bank.code === code);
  return index < 0 ? 99 : index;
}

/** What a list holds per key, keeping the order in which keys first appear. */
export function groupBy<T>(list: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of list) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
