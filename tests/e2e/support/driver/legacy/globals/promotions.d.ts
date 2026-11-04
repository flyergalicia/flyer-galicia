// Globals of the current app for promotions and the windows that offer its brands.
// Only driver/legacy may use them.

interface LegacyPromosEntry {
  id: number | string;
  titulo: string;
  subtitulo?: string | null;
  imagen?: string | null;
  beneficio?: string | null;
  dias?: string | null;
  fecha_hasta?: string | null;
  proximamente?: boolean;
  origen?: string;
  provincias?: string[] | null;
  localidades?: string[] | null;
}

interface LegacyPromosResult {
  marca?: string;
  promo?: LegacyPromosEntry | null;
  hermanaDe?: unknown;
  necesitaRevision?: boolean;
}

interface LegacyZone {
  k: string;
  ok(promotion: LegacyPromosEntry): boolean;
}

interface LegacyZoneChoice {
  prov?: string;
  loc?: string;
}

interface LegacyBrandFilters extends LegacyZoneChoice {
  q?: string;
  soloPct?: boolean;
}

// What Armar franja keeps of its filters; the rest of this state is declared elsewhere.
interface LegacyStripState extends LegacyBrandFilters {}

interface LegacyLogoPlace {
  x: number;
  y: number;
  w: number;
  h: number;
  bg?: string;
  error?: string;
}

interface LegacyDaysSplit {
  logo: LegacyLogoPlace;
  texto?: LegacyLogoPlace | null;
}

interface LegacyLogoChange {
  texto?: string;
  fs?: number;
  peso?: number;
  color?: string;
}

interface LegacyWatchedBrand {
  m?: string;
  t?: string;
  img?: string;
  origen?: string;
}

interface LegacyDesignLogo {
  tipo?: string;
  texto?: string;
  img?: string;
  t?: string;
}

declare var _promosCat: LegacyPromosEntry[] | null;
declare var _promosConModo: boolean;
declare var _promosResultados: LegacyPromosResult[] | null;
declare var _promosProv: string;
declare var _promosLoc: string;
declare var _promosLocIds: unknown;
declare var _fgLocIds: Record<string, unknown>;
declare var _fgLgVencIdx: { cat: unknown };

declare function switchApp(view: string): void;
declare function switchPromoTab(tab: string): void;
declare function fgLogosModo(on: boolean): void;
declare function openAdminPanel(): void;
declare function switchAdminTab(element: Element | null, tab: string): void;
declare function _promoElegirCandidato(row: number, candidate: number): void;
declare function _promoDias(promotion: LegacyPromosEntry, zone?: LegacyZone | null): string;
declare function _promoDiasPropios(promotion: LegacyPromosEntry): string;
declare function _promoTienePct(promotion: LegacyPromosEntry, zone?: LegacyZone | null): boolean;
declare function _promoZona(choice: LegacyZoneChoice): LegacyZone | null;
declare function _promoEnProvincia(promotion: LegacyPromosEntry, province: string): boolean;
declare function _promoEnLocalidad(
  promotion: LegacyPromosEntry,
  province: string,
  locality: string,
  byId: Record<string, unknown>,
): boolean;
declare function _promoEstado(end: string | null | undefined, today: Date): string;
declare function _promoEsModo(promotion: LegacyPromosEntry): boolean;
declare function _promoSetModo(on: boolean): void;
declare function _callPromosFn(
  action: string,
  body: Record<string, unknown>,
  done: (error: unknown, reply: { data?: { ids?: unknown[] } } | null) => void,
): void;
declare function _fgLgManual(x: number, y: number, w: number, h: number): LegacyLogoPlace;
declare function _fgLgDetectar(x: number, y: number): LegacyLogoPlace;
declare function _fgLgAbrir(place: LegacyLogoPlace): void;
declare function _fgLgPartirDias(place: LegacyLogoPlace): LegacyDaysSplit;
declare function _fgLgActivos(): LegacyLogoChange[];
declare function _fgLgVencida(change: LegacyLogoChange): boolean;
declare function _fgFrAbrir(place: LegacyLogoPlace): void;
declare function _fgPfFiltrar(
  filters: LegacyBrandFilters,
  changed: () => void,
): { lista: LegacyPromosEntry[] };
declare function _vigSumarEstudio(
  baseOption: number,
  newOption: number,
  logos: LegacyDesignLogo[],
): Promise<unknown>;
