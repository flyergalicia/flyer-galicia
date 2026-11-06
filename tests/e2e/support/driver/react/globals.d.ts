// What the React app lets a test read: see web/src/shared/lib/test-probe.ts.
import {
  type BenchmarkOffer,
  type BenchmarkOfferQuery,
  type BenchmarkPresentation,
  type BenchmarkPromotion,
} from "../benchmark.ts";
import { type CatalogPromotion, type PromotionQuery, type PromotionZone } from "../promotions.ts";

export interface PromotionsProbe {
  includeModo(): boolean;
  province(): string;
  locality(): string;
  localityAnswered(): boolean;
  catalog(): CatalogPromotion[];
  idsIn(provinces: readonly string[]): string[];
  currentOffers(title: string, province: string): number;
  flyerDays(query: PromotionQuery, zone: PromotionZone | null): Promise<string>;
  hasPercent(query: PromotionQuery, zone: PromotionZone | null): Promise<boolean>;
  withPercent(titles: readonly string[]): string[];
  ownDays(query: PromotionQuery): string;
  inProvince(query: PromotionQuery, province: string): boolean;
  modoShownInLocality(province: string, locality: string, cities: readonly string[]): boolean;
}

export interface CommercialDashboardProbe {
  actions: number;
  unassigned: number;
  hunterIds: (string | null)[];
  countedOfficerIds: (string | null)[];
}

export interface HunterScreenProbe {
  /** Null: nothing was loaded. */
  loadedCompanies: number | null;
  companiesFailed: boolean;
  flyersFailed: boolean;
  flyersSettled: boolean;
  hasFlyer: Record<string, boolean>;
}

export interface HunterPreviewProbe {
  /** What the flyer on the preview was drawn with. */
  values: Record<string, unknown> | null;
}

export interface CompanyListProbe {
  ownCompanyCount(): number;
  companiesFailed(): boolean;
  ownCompany(row: number): { config: string; firstOfficer: string | undefined };
}

export interface CompanyRegistryProbe extends CompanyListProbe {
  editorCategory(row: number): {
    opcion?: number;
    txt?: string;
    importe?: string;
    importe2?: string;
  };
  destinationOption(company: unknown): number;
  sheetColumns(): readonly string[];
  exportAndReadBack(companies: unknown): { cells: string[][]; unchanged: boolean[] };
  capsOfSheetRow(cells: Record<string, string>): {
    opcion?: number;
    txt?: string;
    importe?: string;
    importe2?: string;
  };
  validateSheet(rows: readonly { cells: Record<string, string>; readerRow?: number }[]): {
    firstCompanyCap: string;
    problems: string[];
  };
}

/** A change of Cambiar logos, with the keys it is stored with. */
export interface ProbedChange {
  tipo?: string;
  img?: string;
  t?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  tx?: number;
  ty?: number;
  tw?: number;
  th?: number;
  ox?: number;
  oy?: number;
  ow?: number;
  oh?: number;
  bw?: number;
  bh?: number;
  fs?: number;
  bfs?: number;
  dup?: boolean;
  texto?: string;
  color?: string;
  peso?: number;
  franja?: string;
  franjaBase?: boolean;
}

export interface StripProbe {
  resuming: boolean;
  brands: {
    logo: string;
    title: string;
    size: number;
    moved: { x: number; y: number };
    suggested: boolean;
  }[];
  perRow: number;
  sizeOfAll: number;
  marked: number;
  chosen: number[];
  region: { x: number; y: number; width: number; height: number };
  originalLogos: number;
  drawing: {
    x0: number;
    y0: number;
    width: number;
    boxes: ({ tx: number; ty: number; tw: number; th: number } | null)[];
  };
  isSettled: boolean;
}

export interface LogoStripWindowProbe {
  offers(): readonly { id: number | string; logo: string; title: string; isOnline: boolean }[];
}

export interface LogoEditorProbe {
  catalogSize(): number;
  placed(): readonly ProbedChange[];
  all(): readonly ProbedChange[];
  selection(): { main: number; chosen: number[]; flyerLogos: number };
  isSettled(): boolean;
  isDragging(): boolean;
  isEditing(): boolean;
  mode(): "none" | "strip" | "trim" | "insert";
  clean(): boolean;
  undoSteps(): string[];
  openDesign(): string | null;
  pickerTarget(): number;
  pictureScale(): number;
  toClient(x: number, y: number): { x: number; y: number } | null;
  imageOf(key: string): HTMLCanvasElement | null;
  detect(x: number, y: number): { x: number; y: number; w: number; h: number } | null;
  hasDaysBelow(x: number, y: number): boolean;
  strip(): StripProbe | null;
  detectStrip(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { logos: number; rows: number[]; perRow: number } | null;
  catalogRows(): readonly (Record<string, unknown> & { imagen?: string | null })[];
  selectionFacts(province: string): readonly {
    logo: string;
    suggested: boolean;
    category: string;
    brandKey: string;
    promotionId: number | string;
    hasLocalPromotion: boolean;
    hasPromotionThereOrOnline: boolean;
  }[];
  topCategoryIn(province: string): string;
  cuts(): readonly FlyerCut[];
  section(): { u: string; sy: number; sh: number; sw: number } | null;
  sectionImage(address: string): HTMLImageElement | null;
  isBlankRow(where: "current" | "whole" | "section", row: number): boolean;
  missingSections(): number;
  openWork(): { id: string; name: string; isDraft: boolean } | null;
  work(id: string): { id: string; name: string; isDraft: boolean } | null;
  isOpening(): boolean;
  canUseOption(option: number): boolean;
  profileHasOption(option: number): boolean;
  openWorkUploads(): readonly string[];
  offeredUploads(): readonly string[];
  draftsReviewed(): boolean;
  draftsKey(): string;
  isPlacing(): boolean;
}

export interface FlyerCut {
  y: number;
  h: number;
  ins?: { u: string; sy: number; sh: number; sw?: number; pad?: number };
}

export interface FlyerWorkspaceProbe {
  getState(): {
    zoom: number;
    scale: number;
    draws: number;
    extra: number;
    slot: {
      option: number | null;
      loading: boolean;
      failure: string | null;
      scene: {
        artKey: string;
        art: HTMLImageElement | HTMLCanvasElement;
        calibration: Record<string, unknown> & { empresa: { yc: number; off?: boolean } };
        cuts: readonly FlyerCut[];
        whole: {
          art: HTMLImageElement | HTMLCanvasElement;
          artKey: string;
          rawCalibration: Record<string, unknown>;
        };
      } | null;
    };
  };
  currentValues(): { logos?: readonly ProbedChange[] };
  renderDownload(): HTMLCanvasElement | null;
}

export interface FlyerReadingsProbe {
  legalWith(template: string): string;
  /** The parts of a legal text that come out in bold. */
  boldParts(text: string): string[];
  optionStatus(option: number): {
    settled: boolean;
    hasArtwork: boolean | null;
    ready: boolean;
  };
  /** Draws the flyer on screen for download, with these values over what the form says. */
  renderWith(values: Record<string, unknown>): void;
  /** Why it cannot be downloaded, in the words the person reads; "" if it can. */
  blockText(): string;
  optionCalibration(option: number): Record<string, unknown>;
}

/** One flyer of the history, as it is kept in the browser. */
export interface HistoryItemProbe {
  v: { recortes?: readonly unknown[]; recBase?: string; logos?: readonly unknown[] };
}

export interface FlyerBarProbe {
  split(
    favorites: readonly number[],
    enabled: readonly number[],
  ): { favorite: number | null; others: number } | null;
  optionsOfTab(tab: string): readonly number[];
  afterStar(favorites: readonly number[], option: number): readonly number[];
}

export interface FlyerBatchProbe {
  isRunning(): boolean;
  rowNumbers(): readonly (number | null)[];
  drawn(): readonly {
    company: string;
    officer: string;
    phone: string;
    firstAmount: string;
    noCashback: boolean;
    option: number;
    hasAmounts: boolean;
  }[];
  /** The version without cashback of that option; 0 when there is none. */
  versionOf(option: number): number;
  /** The option that version is of, itself if it is not one. */
  baseOf(option: number): number;
  /** What the list of options says it is the version of. */
  listedAsVersionOf(option: number): number | null;
}

export interface FlyerKnowledgeProbe {
  done: boolean;
  failed: boolean;
  hasFlyer: Record<string, boolean>;
  answer(option: number): boolean | undefined;
  isGenerating(): boolean;
}

export interface BenchmarkProbe {
  promotions(): BenchmarkPromotion[];
  bestOffer(query: BenchmarkOfferQuery): BenchmarkOffer | null;
  mostInstallments(bank: string): number | null;
  present(row: Record<string, unknown>): BenchmarkPresentation;
}

export interface PermissionsProbe {
  startsAllowed(role: string, key: string): boolean;
}

/** The calibrator open: what it would save, and where each zone is on its canvas. */
export interface CalibratorProbe {
  calibration: Record<string, unknown> & {
    benef?: { lineas?: { t: string; x: number }[] | null };
  };
  rects: Record<string, { x: number; y: number; w: number; h: number }>;
  scale: number;
}

declare global {
  interface Window {
    // Registered by each screen when it is opened.
    __flyerProbe?: {
      readonly promotions?: () => PromotionsProbe;
      readonly companyRegistry?: () => CompanyRegistryProbe;
      readonly companyList?: () => CompanyListProbe;
      readonly logoEditor?: () => LogoEditorProbe;
      readonly logoStripWindow?: () => LogoStripWindowProbe;
      readonly flyerWorkspace?: () => FlyerWorkspaceProbe;
      readonly flyerReadings?: () => FlyerReadingsProbe;
      readonly flyerHistory?: () => readonly HistoryItemProbe[];
      readonly flyerBar?: () => FlyerBarProbe;
      readonly flyerBatch?: () => FlyerBatchProbe;
      readonly flyerKnowledge?: () => FlyerKnowledgeProbe;
      readonly hunterScreen?: () => HunterScreenProbe;
      readonly commercialDashboard?: () => CommercialDashboardProbe | null;
      readonly hunterPreview?: () => HunterPreviewProbe;
      readonly studioNotices?: () => { questions: number; shared: number };
      readonly pdfReader?: () => { version: string };
      readonly benchmark?: () => BenchmarkProbe;
      readonly permissions?: () => PermissionsProbe;
      readonly calibrator?: () => CalibratorProbe;
      readonly pdfConversion?: () => {
        withBands(file: File, bandHeight: number): Promise<HTMLCanvasElement | null>;
      };
    };
  }
}
