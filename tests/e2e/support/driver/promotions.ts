export type PromotionsTab = "search" | "active";

/** The places where a province is chosen. */
export type ProvinceField = "promotions" | "brandPicker" | "logoStrip";

/** One promotion of the catalog: the first with this exact title and part of this benefit. */
export interface PromotionQuery {
  title: string;
  benefit?: string;
}

/** Where the advisor works. Without a zone, the whole country counts. */
export interface PromotionZone {
  provinces: string[];
  locality?: string;
}

export interface CatalogPromotion {
  /** Its id at the source, so it can be compared with what the source published. */
  sourceId: string;
  origin: "galicia" | "modo";
  title: string;
  category: string;
  benefit: string;
  days: string;
  hasLogo: boolean;
}

/** A row of the Promociones table, as it reads on screen. */
export interface PromotionRowView {
  /** The brand as it was pasted; only Buscar has it. */
  brand: string;
  title: string;
  benefit: string;
  note: string;
  days: string;
  category: string;
  where: string;
  status: string;
  /** All the text of the cell that describes the promo. */
  description: string;
  logoUrl: string;
  hasPercentDot: boolean;
  hasModoTag: boolean;
  linkText: string;
  linkUrl: string;
}

/** A brand card of the windows that offer brands for a logo or a strip. */
export interface BrandCardView {
  title: string;
  /** The small line under the title. */
  detail: string;
  logoUrl: string;
  hasPercentDot: boolean;
  hasModoTag: boolean;
  /** The note shown on hover, when the card has one. */
  noteOnHover: string;
  /** "3 promos", when the logo has several. */
  morePromos: string;
  morePromosOnHover: string;
}

export interface ProvinceFieldView {
  /** The provinces chosen on the control, in the order of the list. */
  selected: string[];
  /** What the closed control reads. */
  label: string;
  /** The provinces the screen is actually filtering by. */
  inUse: string[];
}

export interface LocalityFieldView {
  hidden: boolean;
  disabled: boolean;
  /** The text of its first entry. */
  placeholder: string;
  /** The locality the screen is actually filtering by. */
  inUse: string;
}

export interface FlyerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A picture drawn for a test, to stand in for the artwork of a flyer. */
export interface DrawnArtwork {
  width: number;
  height: number;
  blocks: (FlyerBox & { color: string })[];
  texts: { text: string; x: number; baseline: number; color: string; font: string }[];
}

export interface DaysTextSearch {
  /** How tall the logo stays once the text is told apart, in flyer pixels. */
  logoHeight: number;
  daysText: { top: number; height: number } | null;
}

export interface PlacedLogo {
  title: string;
  logoFile: string;
  centerX: number;
  bottom: number;
}

export interface PlacedText {
  text: string;
  fontSize: number;
  weight: number;
  color: string;
  centerX: number;
  top: number;
}

/** What Cambiar logos has put on the flyer, in rounded flyer pixels. */
export interface PlacedOnFlyer {
  logos: PlacedLogo[];
  texts: PlacedText[];
  /** The title of what is selected; empty when nothing is. */
  selectedTitle: string;
}

/** What a design has in place of a logo, when it is published. */
export type DesignLogo =
  | { kind: "catalogBrand"; title: string; logoFile: string }
  | { kind: "text"; text: string }
  | { kind: "uploaded"; title: string }
  | { kind: "ownFlyerLogo"; title: string };

export interface WatchedBrandView {
  brand: string;
  status: string;
}

/** What specs can do on Promociones and on the windows that offer its brands. */
export interface PromotionsDriver {
  /** Waits until the catalog arrived, wherever it was asked from. */
  waitForCatalog(): Promise<void>;
  /** Goes to Promociones, on that tab, with the catalog already there. */
  open(tab: PromotionsTab): Promise<void>;
  /** Goes to the tab with no catalog to wait for: it may never have any rows. */
  openWithoutCatalog(tab: PromotionsTab): Promise<void>;
  /** Goes to that tab, already on Promociones. */
  switchTab(tab: PromotionsTab): Promise<void>;
  /** Goes back to the flyer. */
  backToFlyer(): Promise<void>;
  /** Presses Ver promociones and waits for the rows. */
  listActive(): Promise<void>;
  /** Pastes the brands and presses Validar vigencia. */
  searchBrands(brands: string[]): Promise<void>;
  rows(): Promise<PromotionRowView[]>;
  /** Chooses again the first match of a pasted brand, as the Revisar rows let you do. */
  confirmMatchAgain(brand: string): Promise<void>;
  /** Presses the head of a column of the table: once sorts, twice reverses. */
  sortBy(column: string): Promise<void>;
  /** The chosen ordering of the table, as the control reads. */
  statusCounters(): Promise<string[]>;
  /** Writes in the search box over the results. */
  filterResults(text: string): Promise<void>;
  /** The search box over the results keeps the focus after a key. */
  resultsFilterHasFocus(): Promise<boolean>;
  /** Writes in the filter of a column, found by the text it shows when empty. */
  filterColumn(hint: string, text: string): Promise<void>;
  /** Chooses in the filter of the column Estado. */
  filterStatus(label: string): Promise<void>;
  /** Pastes the brands and presses the button, whatever is happening. */
  pressValidate(brands: string[]): Promise<void>;
  /** Pastes brands and presses Ctrl+Enter inside the box. */
  validateWithShortcut(brands: string[]): Promise<void>;
  /** The button that validates cannot be pressed. */
  validateIsLocked(): Promise<boolean>;
  /** Text of the button that validates. */
  validateButtonText(): Promise<string>;
  /** Presses the button that brings the catalog from Galicia. */
  pressUpdateCatalog(): Promise<void>;
  updateCatalogButton(): Promise<{ text: string; locked: boolean }>;
  /** The line that says how old the catalog is. */
  catalogStatus(): Promise<string>;
  /** Presses the button that downloads and reads the sheet. */
  downloadSheet(): Promise<{ head: string[]; rows: string[][] }>;
  /** Whether the Una sola fila por marca tick of that tab is on, even if it is out of sight. */
  oneRowPerBrandIsOn(tab: PromotionsTab): Promise<boolean>;
  /** Sets the tick "Sólo las nuevas". */
  setOnlyNew(on: boolean): Promise<void>;
  /** Sets the tick of Activas that leaves one row per brand. */
  setOneRowPerBrand(on: boolean): Promise<void>;
  /** Which promotions the Activas tab found; as ids, to compare with promotionIdsIn. */
  activeResultIds(): Promise<string[]>;

  /** Everything the app knows about, respecting Incluir MODO. */
  catalog(): Promise<CatalogPromotion[]>;
  /** Promotions of the catalog that apply in any of those provinces. */
  promotionIdsIn(provinces: string[]): Promise<string[]>;
  /** Current promotions with that title in the province. */
  currentOfferCount(title: string, province: string): Promise<number>;
  /** The weekdays that go under the logo of a supermarket on the flyer. */
  supermarketDaysOnFlyer(promotion: PromotionQuery, zone?: PromotionZone): Promise<string>;
  /** Whether it is a supermarket with a current % discount, which earns the red dot. */
  hasPercentDiscount(promotion: PromotionQuery, zone?: PromotionZone): Promise<boolean>;
  /** Those of the titles that have a current % discount, in the same order. */
  titlesWithPercentDiscount(titles: string[]): Promise<string[]>;
  /** The days that promotion publishes, as the table and the Excel show them. */
  ownDays(promotion: PromotionQuery): Promise<string>;
  /** Whether a filter by that province keeps the promotion. */
  appliesInProvince(promotion: PromotionQuery, province: string): Promise<boolean>;
  /** Whether a filter by locality keeps a MODO promotion that has stores in those cities. */
  modoPromotionShownInLocality(place: {
    province: string;
    locality: string;
    cities: string[];
  }): Promise<boolean>;

  /** The state of Incluir MODO, which is one tick wherever it shows. */
  includeModoIsOn(): Promise<boolean>;
  setIncludeModo(on: boolean): Promise<void>;
  /** What this browser will remember next time; null when it remembers nothing. */
  rememberedIncludeModo(): Promise<boolean | null>;

  /** Opens the window of brands for a place marked with a rectangle on the flyer. */
  openBrandPickerOver(place: FlyerBox): Promise<void>;
  /** Opens the window of brands for the logo found at that point of the flyer. */
  openBrandPickerAt(point: { x: number; y: number }): Promise<void>;
  closeBrandPicker(): Promise<void>;
  /** Types in the search box of the window and waits for the list to follow. */
  searchInBrandPicker(text: string): Promise<void>;
  brandCards(): Promise<BrandCardView[]>;
  /** Touches a card and waits for the logo to be on the flyer. */
  pickBrand(title: string): Promise<void>;

  /** Opens Armar franja for a strip marked with a rectangle on the flyer. */
  openLogoStripOver(place: FlyerBox): Promise<void>;
  closeLogoStrip(): Promise<void>;
  /** Types in the search box of Armar franja and waits for the list to follow. */
  searchInLogoStrip(text: string): Promise<void>;
  logoStripCards(): Promise<BrandCardView[]>;
  /** All that Armar franja offers with its filters, as ids; its cards stop at a limit. */
  logoStripOfferIds(): Promise<string[]>;

  /** Chooses with the control the user sees and waits for what it filters. */
  chooseProvince(field: ProvinceField, province: string): Promise<void>;
  chooseLocality(field: ProvinceField, locality: string): Promise<void>;
  provinceField(field: ProvinceField): Promise<ProvinceFieldView>;
  localityField(field: ProvinceField): Promise<LocalityFieldView>;

  openProvinceMenu(field: ProvinceField): Promise<void>;
  openProvinceMenuWithKeyboard(field: ProvinceField): Promise<void>;
  provinceMenuIsOpen(): Promise<boolean>;
  /** The provinces with a tick on the open list. */
  provinceMenuTicked(): Promise<string[]>;
  /** A plain click on that province. */
  clickInProvinceMenu(province: string): Promise<void>;
  /** Shift + click on that province. */
  shiftClickInProvinceMenu(province: string): Promise<void>;
  /** The minus button of the row of a province that is chosen. */
  removeInProvinceMenu(province: string): Promise<void>;
  clickAllProvincesInProvinceMenu(): Promise<void>;

  /** Whether a red dot is drawn over the flyer itself. */
  percentDotOnFlyer(): Promise<boolean>;
  /** The logos marked as expired on the flyer, by title. */
  expiredLogosOnFlyer(): Promise<string[]>;
  placedOnFlyer(): Promise<PlacedOnFlyer>;
  /** Looks for the printed days of a logo on a picture made for the test. */
  findDaysTextOn(artwork: DrawnArtwork, logo: FlyerBox): Promise<DaysTextSearch>;
  /** Whether the logo at that point of the flyer has printed days below it. */
  hasDaysTextBelowLogoAt(point: { x: number; y: number }): Promise<boolean>;

  /** The flyer the bar "Vigilar estas marcas en" of Buscar has chosen. */
  watchBarOption(): Promise<number>;
  /** On Buscar, saves what was found as the watched brands of a flyer option. */
  watchFoundBrandsOn(option: number): Promise<void>;
  /** Admin → Config → Marcas vigiladas. */
  openWatchedBrands(): Promise<WatchedBrandView[]>;
  closeWatchedBrands(): Promise<void>;
  /** Presses the first × and returns what is left. */
  stopWatchingFirstBrand(): Promise<WatchedBrandView[]>;
  /** What publishing a design from Estudio does to the watched brands of the new option. */
  addDesignLogosToWatchedBrands(
    baseOption: number,
    newOption: number,
    logos: DesignLogo[],
  ): Promise<void>;
}
