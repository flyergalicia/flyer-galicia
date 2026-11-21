import { type FlyerRegion } from "./flyer-editor.ts";

export interface InsertedSection {
  /** Address of the flyer the section was copied from. */
  source: string;
  y: number;
  height: number;
  width: number;
  /** Blank space added above and below it. */
  padding: number;
}

/** A band taken out of the flyer, or a section put in, at that height of the artwork. */
export interface FlyerCut {
  y: number;
  height: number;
  inserted: InsertedSection | null;
}

export interface CropStatus {
  active: boolean;
  cuts: FlyerCut[];
  artworkHeight: number;
  /** This flyer draws no amounts. */
  amountsHidden: boolean;
  /** The Montos card of the form is out of sight. */
  amountsCardHidden: boolean;
}

export interface FlyerTab {
  label: string;
  active: boolean;
  /** A flyer option; otherwise it is an open draft or design. */
  isFlyer: boolean;
  option: number | null;
}

export interface OpenWork {
  name: string;
  isDraft: boolean;
  changes: number;
}

export interface CompanyRecord {
  empresa: string;
  config: string;
  asesores: { nombre: string; celular: string; email?: string }[];
  rubro: string;
}

export interface CompanyNoticeState {
  /** The "this company has cashback" question. */
  confirmation: string | null;
  /** The update notice that explains what to choose. */
  updateNotice: string | null;
}

export interface SavedDrafts {
  /** localStorage key and value, to hand them to a page opened later. */
  key: string;
  value: string | null;
  drafts: { name: string; cuts: number; changes: number }[];
}

export interface BulkRow {
  empresa: string;
  config: string;
  asesor1_nombre: string;
}

export interface BulkOutcome {
  /** One per flyer generated: company, option used and whether it carried amounts. */
  generated: { company: string; option: number; hasAmounts: boolean }[];
  zipName: string | null;
  finalOption: number;
}

export interface InsertStatus {
  placing: boolean;
  section: { y: number; height: number; width: number } | null;
  pickerOpen: boolean;
  buttonLabel: string;
  /** The line "Va acá" is on the page, seen or not. */
  lineOnPage: boolean;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfProbes {
  points: Record<string, PdfPoint>;
  /** Counts the dark pixels in this part of the image. */
  inkRegion: FlyerRegion;
}

export interface PdfImageReading {
  width: number;
  height: number;
  colors: Record<string, [number, number, number]>;
  darkPixels: number;
}

export interface BandHeightComparison {
  failed: boolean;
  heightA: number;
  heightB: number;
  millisecondsA: number;
  millisecondsB: number;
  meanDifference: number;
  differentRows: number;
}

/** Cropping, inserting sections, drafts and the flyer history. */
export interface FlyerSectionsDriver {
  // Cropping
  /** Presses Recortar. */
  toggleCropping(): Promise<void>;
  isMarkingCrop(): Promise<boolean>;
  cropButtonLabel(): Promise<string>;
  /** Drags over the flyer from one height to another and leaves the confirmation open. */
  dragCropBand(fromY: number, toY: number): Promise<void>;
  /** Presses "Quitar esta parte". */
  confirmCrop(): Promise<void>;
  /** Takes out that band of the artwork at once. */
  removeBand(y: number, height: number): Promise<void>;
  cropStatus(): Promise<CropStatus>;
  /** The small sign that lists the cuts; null when it is not on screen. */
  cropSign(): Promise<string | null>;
  /** Presses "Volver a como estaba". */
  undoCrop(): Promise<void>;
  /** Removes whatever was cropped, without going through the sign. */
  dropCrop(): Promise<void>;
  /** Comes back to the current option as if it had been chosen again. */
  reenterCurrentOption(): Promise<void>;
  /** Where the company name is drawn. */
  companyNamePlacement(): Promise<{ centerY: number; off: boolean }>;
  /** The legal text with the amounts of the current form put in. */
  legalWithAmounts(template: string): Promise<string>;
  /** How much the rows at both sides of the first cut differ. */
  seamDifference(): Promise<number>;
  /** A sparse sample of the pixels of a band of the download; see meanDifference. */
  downloadBandSample(y: number, height: number): Promise<number[]>;
  downloadHeight(): Promise<number>;
  /** The size of an image, decoded by the browser. */
  imageSize(bytes: Buffer): Promise<{ width: number; height: number }>;

  // Form
  setLegal(text: string): Promise<void>;
  legal(): Promise<string>;
  /** Text of the first amount as the flyer would draw it. */
  firstAmount(): Promise<string>;
  /** Presses Descargar PDF and returns the name of each file that came out. */
  downloadPdf(): Promise<string[]>;

  // Tabs, drafts and designs
  tabs(): Promise<FlyerTab[]>;
  /** Touches a flyer tab; without an option, the first one. */
  selectFlyerTab(option?: number): Promise<void>;
  /** Touches the open draft or design at that position. */
  selectOpenTab(index: number): Promise<void>;
  /** Touches the × of the open draft or design at that position. */
  closeOpenTab(index: number): Promise<void>;
  /** Touches the × of the first draft, which asks first if it has changes. */
  closeFirstDraftTab(): Promise<void>;
  /** Presses Nuevo borrador. */
  newDraft(): Promise<void>;
  /** The draft or design on screen; null on the clean flyer. */
  openWork(): Promise<OpenWork | null>;
  /** Waits until the draft or design with that id has finished opening. */
  waitForOpenWork(id: string): Promise<void>;
  /** Touches a design and, before it opens, another one or a flyer. */
  openDesignThenAnother(first: string, second: string): Promise<void>;
  openDesignThenFlyer(design: string, option: number): Promise<void>;
  /** Text of the drawn changes, of the active tabs and of what a download would carry. */
  openWorkReading(): Promise<{
    openId: string | null;
    texts: string[];
    downloadTexts: string[];
    activeTabs: string[];
  }>;

  // Company search
  bringCompany(company: CompanyRecord): Promise<void>;
  companyNotices(): Promise<CompanyNoticeState>;
  closeCompanyUpdateNotice(): Promise<void>;
  /** The current flyer stops carrying amounts, without being linked to an original. */
  turnOffAmountsWithoutOriginal(): Promise<void>;
  /** The version with no cashback of that option, as the option list links it. */
  noCashbackLink(option: number): Promise<{ listed: number | null; variant: number; base: number }>;
  /** The option Generar flyers would use for that company. */
  optionForCompany(company: CompanyRecord): Promise<number>;
  /** Runs Masivo over those rows and waits for its ZIP. */
  generateBulk(rows: BulkRow[]): Promise<BulkOutcome>;

  // Drafts kept in the browser
  waitForDraftsReviewed(): Promise<void>;
  savedDrafts(): Promise<SavedDrafts>;
  /** The browser refuses all access to its storage from now on. */
  blockBrowserStorage(): Promise<void>;

  // History
  /** Adds what is on screen to the history. */
  keepInHistory(): Promise<void>;
  /** What the newest history entry remembers. */
  newestHistoryEntry(): Promise<{ cuts: number; hasBase: boolean; logos: number }>;
  /** The height of the PDF of the newest history entry. */
  redownloadHeightFromHistory(): Promise<number>;
  /** Presses Cargar on the newest history entry and waits for it to open. */
  loadFromHistory(): Promise<void>;

  // Inserting a section
  insertButtonVisible(): Promise<boolean>;
  /** Presses Insertar and waits for the only flyer to copy from. */
  /** The window to choose a flyer to copy from can be seen. */
  insertPickerOpen(): Promise<boolean>;
  openInsertPicker(): Promise<void>;
  copyEnabled(): Promise<boolean>;
  /** Drags over the flyer to copy from, from one height of its image to another. */
  markSectionToCopy(fromY: number, toY: number): Promise<void>;
  sectionMarkVisible(): Promise<boolean>;
  /** Presses "Copiar esta sección". */
  copyMarkedSection(): Promise<void>;
  insertStatus(): Promise<InsertStatus>;
  /** The copied block starts and ends right at the blank rows around it. */
  copiedSectionFitsItsBlock(): Promise<boolean>;
  /** Brings the mouse over the flyer at that height. */
  hoverForPlacement(y: number): Promise<void>;
  placementLineVisible(): Promise<boolean>;
  /** Clicks where the mouse was brought with hoverForPlacement. */
  clickToPlace(y: number): Promise<void>;
  /** Blank rows above and below the first inserted section. */
  spaceAroundFirstInsertion(): Promise<{ above: number; below: number }>;
  /** That row is blank in the whole flyer, before anything was inserted. */
  isGapInWholeFlyer(y: number): Promise<boolean>;
  /** A sparse sample of the source of the first insertion. */
  sourceSectionSample(y: number, height: number): Promise<number[]>;
  /** The app forgets the images of the sections it downloaded. */
  forgetSectionImages(): Promise<void>;
  sectionsMissingImage(): Promise<number>;
  /** Waits for the sections copied a moment ago to be offered. */
  waitForRecentSection(): Promise<void>;
  pickRecentSection(): Promise<void>;
  /** Presses a key with no field taking it, and gives the app a moment to react. */
  pressShortcut(key: string): Promise<void>;
  /** Presses Deshacer in the logo bar. */
  pressUndo(): Promise<void>;
  /** Presses Rehacer in the logo bar. */
  pressRedo(): Promise<void>;
  /** Shown in Estudio: how many flyers to copy from can be used now. */
  sourcesInDepot(): Promise<number>;

  // Converting a PDF
  convertPdf(pdf: Buffer, probes: PdfProbes): Promise<PdfImageReading | null>;
  /** Starts a conversion, waits and tells whether it finished. */
  tryConvertPdf(pdf: Buffer, waitMs: number): Promise<boolean>;
  pdfReaderVersion(): Promise<string>;
  /** The Content-Security-Policy of the page. */
  securityPolicy(): Promise<string>;
  /** Converts with two band heights and compares the two images. */
  compareBandHeights(
    pdf: Buffer,
    name: string,
    heights: [number, number],
  ): Promise<BandHeightComparison>;

  // Fallback checks
  /** The reason a download is refused while the flyer on screen has failed to load. */
  downloadBlockWithFailedFlyer(): Promise<string>;
}
