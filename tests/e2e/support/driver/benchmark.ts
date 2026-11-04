export type BenchmarkView = "rubro" | "brand" | "week" | "merchant" | "versus" | "cards";
export type BenchmarkAudience = "all" | "classic" | "premium";
export type BenchmarkCardType = "all" | "debit";
export type BenchmarkOutcome = "all" | "we-lose";

export interface BenchmarkAccess {
  /** The profile of this user has the faculty. */
  allowed: boolean;
  tabShown: boolean;
  /** The code of Benchmark has reached the browser. */
  codeLoaded: boolean;
}

/** A promotion that counts with the filters on screen. */
export interface BenchmarkPromotion {
  title: string;
  bank: string;
  rubro: string;
  source: string | null;
  days: string;
  brandKey: string;
  /** How many banks share it; more than one means it is valid with any of them. */
  banksSharing: number | null;
  /** What it gives back on the reference purchase; null when it gives no refund. */
  returned: number | null;
  cap: number | null;
  /** Who it is only for, as the screen names them; empty when it is for everybody. */
  audience: string;
}

export interface BenchmarkOffer {
  title: string;
  returned: number;
  cap: number | null;
  /** Who it is only for, as the screen names them; empty when it is for everybody. */
  audience: string;
  source: string | null;
}

export interface BenchmarkOfferQuery {
  bank?: string;
  rubro?: string;
  titles?: string[];
}

export interface BenchmarkSourceLabel {
  text: string;
  /** Marked as old: too long since that bank was read. */
  stale: boolean;
}

export interface BenchmarkDayListing {
  /** The N of the button "Ver las N promos". */
  announced: number;
  rows: number;
  /** The panel has its heading "Banco · Día: N promos". */
  hasHeading: boolean;
}

export interface BenchmarkMerchantResults {
  text: string;
  rows: number;
  banks: string[];
}

/** How the screen presents one promotion row, given as it comes from the database. */
export interface BenchmarkPresentation {
  link: string;
  /** "Empieza el dd/mm", "Sólo el dd/mm"...; empty when there is nothing to say. */
  schedule: string;
  cap: string;
  audience: string;
}

export interface BenchmarkCardFields {
  bank?: string;
  card?: string;
  passesPerYear?: string;
  cost?: string;
  sourceUrl?: string;
}

export interface BenchmarkManualFields {
  bank?: string;
  rubro?: string;
  title?: string;
  percent?: string;
  cap?: string;
  capPerMonth?: boolean;
  /** 0 is Monday. */
  days?: number[];
  condition?: string;
}

export interface BenchmarkWorkbook {
  sheetNames: string[];
  /** Every sheet by its name, header row included. */
  sheets: Record<string, unknown[][]>;
}

/** What specs can do on Benchmark. */
export interface BenchmarkPageWidths {
  /** How wide the page is, with whatever pushes it. */
  page: number;
  /** How wide the panel of Benchmark is, with whatever pushes it. */
  panel: number;
  /** Where the last tab ends. */
  tabs: number;
  /** The widest table on screen and the box it slides in; 0 without tables. */
  table: number;
  tableBox: number;
}

export interface BenchmarkDriver {
  /** Whether this user can get to Benchmark, and how much of it the browser already has. */
  access(): Promise<BenchmarkAccess>;
  /** The faculty a profile starts with when the administrator has not touched it. */
  startsAllowedFor(role: string): Promise<boolean>;
  /** Presses the Benchmark tab and waits until the data has been read. */
  open(): Promise<void>;
  /** Reads everything from the cloud again and waits for the result. */
  reload(): Promise<void>;
  /** Waits until the app finished reading the data it started to read by itself. */
  waitForData(): Promise<void>;

  currentView(): Promise<BenchmarkView>;
  showView(view: BenchmarkView): Promise<void>;
  /** Shows the page of promotions loaded by hand: no tab leads there on purpose. */
  showHandLoadedPromotions(): Promise<void>;

  setProvince(province: string): Promise<void>;
  setRubro(rubro: string): Promise<void>;
  setAudience(audience: BenchmarkAudience): Promise<void>;
  setCardType(card: BenchmarkCardType): Promise<void>;
  setOutcome(outcome: BenchmarkOutcome): Promise<void>;
  setIncludeSalaryOnly(include: boolean): Promise<void>;
  setReferencePurchase(rubro: string, amount: number): Promise<void>;
  /** What the browser remembers about the reference purchases, as stored. */
  rememberedReferencePurchases(): Promise<string | null>;

  promotions(): Promise<BenchmarkPromotion[]>;
  /** The promotion that gives back the most among those that match; null when none does. */
  bestOffer(query: BenchmarkOfferQuery): Promise<BenchmarkOffer | null>;
  /** The longest interest-free installments of a bank; null when it has none. */
  mostInstallments(bank: string): Promise<number | null>;

  sourceLabels(): Promise<BenchmarkSourceLabel[]>;
  /** The cells of that rubro marked as winners: Galicia's or a competitor's. */
  rubroWinners(rubro: string): Promise<("galicia" | "competitor")[]>;
  /** The sentence that counts rubros won and lost. */
  headline(): Promise<string>;
  /** Everything Benchmark shows, with its spaces normalized. */
  screenText(): Promise<string>;
  tabs(): Promise<string[]>;
  /** Widths once the screen is drawn, to tell whether the page scrolls sideways. */
  pageWidths(): Promise<BenchmarkPageWidths>;
  buttons(): Promise<string[]>;
  tableCount(): Promise<number>;
  /** The text of every cell of the tables. */
  tableCells(): Promise<string[]>;
  /** Each row of the main table, as one line. */
  tableRows(): Promise<string[]>;
  firstColumn(): Promise<string[]>;
  /** Brands listed on Cara a cara. */
  listedBrands(): Promise<string[]>;
  /** Where the links of the table lead. */
  tableLinks(): Promise<string[]>;
  /** An image was created from text that came from the database. */
  hasInjectedImage(): Promise<boolean>;
  /** Presses the first "Ver las N promos" of Semana. */
  openFirstDayListing(): Promise<BenchmarkDayListing | null>;

  searchMerchant(text: string): Promise<void>;
  /** The day to look at, 0 is Monday; null is "Cualquier día". */
  setMerchantDay(day: number | null): Promise<void>;
  merchantResults(): Promise<BenchmarkMerchantResults>;

  presentPromotion(row: Record<string, unknown>): Promise<BenchmarkPresentation>;

  editorIsOpen(): Promise<boolean>;
  cancelEditor(): Promise<void>;
  /** Presses Guardar; it does not wait for the outcome. */
  saveEditor(): Promise<void>;
  waitForEditorClosed(): Promise<void>;

  /** Presses "+ Agregar tarjeta". */
  startNewCard(): Promise<void>;
  /** Presses Editar on the row of that card. */
  editCard(bank: string, card: string): Promise<void>;
  fillCard(fields: BenchmarkCardFields): Promise<void>;
  /** Presses Quitar on the row of that card and confirms. */
  removeCard(bank: string, card: string): Promise<void>;

  /** Presses "+ Agregar promo". */
  startNewHandLoadedPromotion(): Promise<void>;
  /** Presses Editar on the row of that promotion. */
  editHandLoadedPromotion(bank: string, title: string): Promise<void>;
  fillHandLoadedPromotion(fields: BenchmarkManualFields): Promise<void>;
  handLoadedCondition(): Promise<string>;

  /** Downloads the Excel and reads it. */
  downloadExcel(): Promise<BenchmarkWorkbook>;
  /** Presses "Actualizar ahora" and waits until it finished. */
  refreshNow(): Promise<void>;
}
