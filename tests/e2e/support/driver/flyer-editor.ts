export interface FlyerRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlyerOptionStatus {
  /** The outcome is known for good; false means the app will try to load it again. */
  settled: boolean;
  /** False is a firm "this option has no flyer"; null means it is not known yet. */
  hasArtwork: boolean | null;
  /** It is on screen, finished loading and its artwork is what gets drawn. */
  ready: boolean;
}

export type DownloadLibrary = "pdf" | "excel" | "zip";

export interface OfficerFields {
  name: string;
  phone: string;
  email: string;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export interface SheetUpload {
  /** The validation summary, as the user reads it. */
  validation: string;
  severity: "error" | "warning" | "ok" | "unknown";
  canGenerate: boolean;
  /** Row of the spreadsheet each loaded line came from. */
  rowNumbers: number[];
  /** Column names of the first line. */
  columns: string[];
}

/** A line of a batch, as its columns read. */
export interface BatchRow {
  cells: Record<string, string>;
  /** Row of the spreadsheet it came from. */
  sheetRow?: number;
}

export interface DrawnFlyer {
  company: string;
  officer: string;
  phone: string;
  firstAmount: string;
  noCashback: boolean;
}

export interface BatchOutcome {
  /** Each flyer it tried to draw, in order. */
  drawn: DrawnFlyer[];
  /** Files in the ZIP, without folders. */
  files: string[];
  /** Resumen.txt from the ZIP. */
  summary: string;
  /** The text under the progress bar. */
  progress: string;
  finalOption: number;
  /** Nothing is being generated any more. */
  idle: boolean;
}

export interface BatchInterference {
  /** Notice after pressing Limpiar in the middle of the batch. */
  clearNotice: string;
  rowsAfterClear: number;
  /** Notice after trying to change flyer in the middle of the batch. */
  switchNotice: string;
  pdfs: number;
  idle: boolean;
}

export interface BatchCompany {
  name: string;
  cashback: string;
  option?: number;
}

export interface HistoryRedownload {
  notice: string;
  saveAttempts: number;
}

export interface ScreenLayout {
  extraHeight: number;
  contentBottom: unknown;
}

export interface DraftStatus {
  id: string | null;
  temporary: boolean;
  name: string | null;
  /** Name of the design the logo editor considers open. */
  designName: string | null;
}

export interface OptionBar {
  /** Text of the flyers in sight, favorite included. */
  tabs: string[];
  favorite: string | null;
  favoriteSelected: boolean;
  /** The dotted place that invites to choose a favorite. */
  hasEmptyFavorite: boolean;
  /** Options kept under the "Otros" button. */
  others: number[];
  othersLabel: string;
  othersSelected: boolean;
  /** Buttons of the bar. */
  buttons: number;
  fitsItsWidth: boolean;
  height: number;
}

export interface OtherFlyersList {
  open: boolean;
  items: string[];
  hasSearchBox: boolean;
  searchBoxFocused: boolean;
  starred: number[];
}

export interface BarSplit {
  favorite: number | null;
  others: number;
}

export interface FlyerEditorDriver {
  selectOption(option: number): Promise<void>;
  /** Forgets all that was loaded for the option and selects it, so it is requested again. */
  reloadOption(option: number): Promise<void>;
  waitForOptionShown(option: number): Promise<void>;
  /** Waits for the notice that takes the place of a flyer that could not load, and reads it. */
  waitForLoadProblem(): Promise<string>;
  waitForNoLoadProblem(): Promise<void>;
  hasLoadProblem(): Promise<boolean>;
  /** Presses Reintentar on that notice. */
  retryLoading(): Promise<void>;
  optionStatus(option: number): Promise<FlyerOptionStatus>;
  /** The artwork being drawn is the one that option loaded. */
  showsArtworkOf(option: number): Promise<boolean>;
  /** The calibration in use, as data. */
  activeCalibration(): Promise<Record<string, unknown>>;
  optionCalibration(option: number): Promise<Record<string, unknown>>;
  /** Why a download is refused, in the words the user reads; empty when it is allowed. */
  downloadBlockReason(): Promise<string>;
  /** The preview is switched off because there is no flyer to trust. */
  previewIsOff(): Promise<boolean>;
  setZoom(zoom: number): Promise<void>;
  /** Presses Restaurar. */
  restoreDefaults(): Promise<void>;
  /** Fingerprint of a region of the image a download would contain, in flyer pixels. */
  downloadRegionDigest(region: FlyerRegion): Promise<string>;
  fillCompanyName(name: string): Promise<void>;
  companyName(): Promise<string>;
  fillOfficerName(name: string): Promise<void>;
  /** Writes the first officer the way a pasted text or a chosen company does. */
  setOfficer(officer: OfficerFields): Promise<void>;
  /** Flips the "sin cashback" switch. */
  setNoCashback(on: boolean): Promise<void>;
  activeOption(): Promise<number>;
  /** Presses Descargar PDF for real and tells what reached the disk. */
  downloadPdfToDisk(): Promise<string>;
  /** Presses PNG in the Otros menu for real and tells what reached the disk. */
  downloadPngToDisk(): Promise<string>;
  /** Opens the Otros menu and reads what it offers. */
  otherActions(): Promise<string[]>;
  /** The share entries that can be seen, in the form and in the preview window. */
  shareOffered(): Promise<boolean>;
  /** Presses Compartir in the Otros menu. */
  pressShare(): Promise<void>;
  /** Goes to a tab of the panel: Individual, Masivo or Historial. */
  chooseEditorTab(name: "Individual" | "Masivo" | "Historial"): Promise<void>;
  /** The rows of the Historial, as they read. */
  historyRows(): Promise<string[]>;
  /** Presses Editar on a row of the Historial. */
  editFromHistory(index: number): Promise<void>;
  /** The validation message under a field of an officer. */
  fieldWarning(field: "phone" | "email", officer?: number): Promise<string>;
  /** The switch of Otros that adds officers by branch. */
  branchesSwitchOffered(): Promise<boolean>;
  pressBranchesSwitch(): Promise<void>;
  /** Writes the place of an officer. */
  fillBranch(officer: number, place: string): Promise<void>;
  fillBranchesTitle(title: string): Promise<void>;
  /** Presses Plantilla in Masivo and reads the sheet that comes out. */
  downloadBatchTemplate(): Promise<{ name: string; head: string[] }>;
  /** Generates the batch for real, up to the file on disk, and counts memory given back. */
  generateBatchToDisk(rows: BatchRow[]): Promise<{
    file: string;
    addressesMade: number;
    addressesReleased: number;
  }>;
  /** The batch fails while building its ZIP. */
  generateBatchWithBrokenZip(rows: BatchRow[]): Promise<{ notice: string; canGenerate: boolean }>;
  /** Asks a batch of companies to generate and reads the question it asks before starting. */
  batchQuestion(companies: BatchCompany[]): Promise<string>;
  /** Types that many letters in the company field within one frame. */
  typeCompanyInOneFrame(letters: number): Promise<void>;
  /** Closes whatever the app offers after a download, saying no. */
  dismissAfterDownload(): Promise<void>;
  /** Presses the button of a cashback configuration. */
  chooseCashback(name: string): Promise<void>;
  /** The labels of the benefit fields that can be seen. */
  benefitFieldLabels(): Promise<string[]>;
  fillBenefitName(name: string): Promise<void>;
  fillBenefitCap(cap: string): Promise<void>;
  legalText(): Promise<string>;
  fillLegal(text: string): Promise<void>;
  selectInLegal(start: number, end: number): Promise<void>;
  /** Presses the button of the legal that puts bold. */
  pressLegalBold(): Promise<void>;
  /** Pastes in the legal what the clipboard would bring from a web page or a mail. */
  pasteInLegal(html: string, text: string): Promise<void>;
  /** Markup that arrived from outside ran as a script on this page. */
  scriptRan(): Promise<boolean>;
  /** Drops what is loaded of an option, so choosing it asks for it again. */
  forgetOption(option: number): Promise<void>;
  /** The last floating notice shown. */
  latestNotice(): Promise<string>;

  loadDownloadLibrary(library: DownloadLibrary): Promise<void>;
  /** The page forgets the library and asks for it again at a new address, skipping the cache. */
  forgetDownloadLibrary(library: DownloadLibrary): Promise<void>;
  /** Presses Descargar PDF that many times within the same instant. */
  downloadPdf(times?: number): Promise<void>;
  downloadPng(): Promise<void>;
  /** Keeps Ctrl+Enter pressed: one press followed by the repetitions of the keyboard. */
  holdDownloadShortcut(): Promise<void>;
  /** The button still shows it is working, or the app refuses another download. */
  downloadIsBusy(): Promise<boolean>;
  /** From now on drawing a flyer for download fails, until repairDrawing. */
  breakDrawing(): Promise<void>;
  repairDrawing(): Promise<void>;
  /** The next download stops at the warning about a flyer of another category. */
  holdDownloadAtCategoryWarning(): Promise<void>;
  confirmCategoryWarning(): Promise<void>;
  /** The flyer on screen acts as one that did not arrive from the network. */
  reportFlyerNotArrived(): Promise<void>;
  /** Takes away the notice of a flyer that did not load. */
  clearLoadProblem(): Promise<void>;
  /** Saves the PDF of the flyer on screen, without going through the download button. */
  saveFlyerAsPdf(): Promise<void>;

  /** Chooses a file in Masivo; returns as soon as the field has it. */
  chooseExcelFile(file: UploadedFile): Promise<void>;
  excelFieldIsEmpty(): Promise<boolean>;
  /** Chooses in Masivo a spreadsheet with these lines, and reads what the app understood. */
  uploadExcelSheet(lines: string[][]): Promise<SheetUpload>;
  /** Generates the batch and waits for its ZIP, whose contents it reads. */
  generateBatch(options?: { rows?: BatchRow[]; failingCompany?: string }): Promise<BatchOutcome>;
  /** Presses Generar ZIP twice in the same instant, and counts the ZIPs that come out. */
  generateBatchTwiceInARow(rows: BatchRow[]): Promise<number>;
  /** Tries Limpiar and to change flyer in the middle of the batch. */
  generateBatchAndInterfere(): Promise<BatchInterference>;
  /** Tries a batch while the flyer on screen did not load. */
  tryBatchWithoutFlyer(rows: BatchRow[]): Promise<{ zips: number; notice: string }>;
  /** Adds an old flyer of that option to the history and downloads it again from there. */
  redownloadFromHistory(option: number): Promise<HistoryRedownload>;

  /** Starts the check of which options have artwork, done some seconds after entering. */
  checkOptionsInBackground(): Promise<void>;
  waitForOptionKnownWithoutArtwork(option: number): Promise<void>;
  /** The option that is the version without cashback of this one; 0 when there is none. */
  noCashbackVariantOf(option: number): Promise<number>;

  /** The parts of a legal text that would come out in bold. */
  boldPartsOfLegal(text: string): Promise<string[]>;
  /** The screen layout before and after drawing a download with four officers. */
  screenLayoutAroundDownload(): Promise<{ before: ScreenLayout; after: ScreenLayout }>;
  redrawFlyer(times: number): Promise<void>;

  /** Presses Guardar en Estudio, fills the name and presses Guardar, without waiting for the answer. */
  startSavingDesign(name: string): Promise<void>;
  /** Presses + Nuevo borrador. */
  newDraft(): Promise<void>;
  /** The draft or design tab open now. */
  openDraft(): Promise<DraftStatus>;
  draftById(id: string): Promise<DraftStatus>;

  waitForOthersButton(): Promise<void>;
  optionBar(): Promise<OptionBar>;
  /** Presses "Otros". */
  openOtherFlyers(): Promise<void>;
  otherFlyers(): Promise<OtherFlyersList>;
  searchOtherFlyers(text: string): Promise<void>;
  /** Presses the star of an option in the list of "Otros". */
  toggleFavorite(option: number): Promise<void>;
  /** Presses the favorite in the bar. */
  chooseFavorite(): Promise<void>;
  waitForOptionSelected(option: number): Promise<void>;
  /** Opens a draft tab over an option, with that name. */
  addDraftTab(tab: { id: string; option: number; name: string }): Promise<void>;
  removeDraftTab(id: string): Promise<void>;
  /** Width of a draft tab and whether the bar still fits with it. */
  draftTabLayout(id: string): Promise<{ width: number; barFits: boolean }>;
  /** How a list of enabled options splits in the bar; null keeps them all in sight. */
  barSplit(favorites: number[], options: number[]): Promise<BarSplit | null>;
  /** The options of a tab of the bar. */
  optionsOfTab(tab: string): Promise<number[]>;
  /** Stars an option starting from these favorites, and returns the favorites left. */
  favoritesAfterStarring(current: number[], option: number): Promise<number[]>;
  /** The option on screen. */
  currentOption(): Promise<number>;
}
