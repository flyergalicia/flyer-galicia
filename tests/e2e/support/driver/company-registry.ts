export interface CompanyOfficer {
  name: string;
  phone?: string;
  email?: string;
}

/** The business category of a company: which flyer it uses and its spending caps. */
export interface CompanyCategory {
  /** Flyer option assigned to the category. */
  option?: number;
  /** The text the sheet had in its category column. */
  name?: string;
  /** Main cap: its meaning depends on the category. */
  cap?: string;
  secondCap?: string;
}

export interface CompanyRecord {
  name: string;
  taxIds?: string[];
  /** Name of its cashback table; empty means it has none. */
  cashback: string;
  officers?: CompanyOfficer[];
  category?: CompanyCategory;
}

/** A row of an uploaded sheet, as its columns read. */
export interface SheetRow {
  cells: Record<string, string>;
  /** Position the spreadsheet reader reports, counting from 0 at the header. */
  readerRow?: number;
}

export interface SearchList {
  text: string;
  hasRetry: boolean;
  /** Companies listed, by name. */
  companies: string[];
  /** Tags saying whose company it is, one for each that is not the user's own. */
  ownerTags: string[];
}

export interface Suggestions {
  visible: boolean;
  count: number;
  ownerTags: number;
}

export interface CapField {
  placeholder: string;
  value: string;
  disabled: boolean;
}

export interface UpdateDialog {
  title: string;
  text: string;
  asksForTaxId: boolean;
}

export interface SavedCompanyState {
  cashback: string;
  firstOfficer: string | undefined;
}

export interface GeneratorTicks {
  /** The list was drawn again: the rows on screen are new elements. */
  repainted: boolean;
  counter: string;
}

export interface FlyerGeneration {
  zips: number;
  files: string[];
  summary: string;
  /** Flyer option on screen once it finished. */
  finalOption: number;
  /** The dialog that explains the outcome, when there is one. */
  notice: string;
  stillGenerating: boolean;
}

export interface SheetExport {
  /** Category, fuel cap and grocery cap, one line per company. */
  cells: string[][];
  /** For each company, whether reading its line back gives the same caps. */
  unchanged: boolean[];
}

export interface SheetValidation {
  firstCompanyCap: string;
  problems: string[];
}

export interface PendingProposal {
  text: string;
  canAskBack: boolean;
}

export interface HunterList {
  text: string;
  /** Companies held in memory; null means nothing was loaded. */
  loadedCompanies: number | null;
  failed: boolean;
  emptyNotices: number;
}

export interface HunterFlyers {
  failed: boolean;
  /** Whether each option has a flyer; an option that could not be asked is absent. */
  hasFlyer: Record<string, boolean>;
}

export interface RegistrySheet {
  name: string;
  head: string[];
  rows: string[][];
}

/** What specs can do on Mis empresas, its search and its flyer generator. */
export interface CompanyRegistryDriver {
  /** Drops the companies in memory, so that the next read goes to the network. */
  forgetCompanies(): Promise<void>;
  loadCompanies(): Promise<void>;
  /** Waits until reading the companies has failed for lack of connection. */
  waitForConnectionProblem(): Promise<void>;
  waitForCompaniesLoaded(count: number): Promise<void>;
  ownCompanyCount(): Promise<number>;
  /** Presses the Reintentar that goes with "No se pudo conectar". */
  retryConnection(): Promise<void>;

  /** Opens the magnifying glass next to the company field. */
  openSearch(): Promise<void>;
  closeSearch(): Promise<void>;
  waitForSearchResults(count: number): Promise<void>;
  searchList(): Promise<SearchList>;
  searchFor(text: string): Promise<void>;
  retrySearch(): Promise<void>;
  /** Clicks a company of the search list. */
  chooseFromSearch(name: string): Promise<void>;
  /** The magnifying glass can be seen next to the company field. */
  searchOffered(): Promise<boolean>;
  /** Types in the company field of the form. */
  typeCompanyName(text: string): Promise<void>;
  suggestions(): Promise<Suggestions>;
  closeSuggestions(): Promise<void>;
  /** Names offered while typing in the company field. */
  suggestedCompanies(): Promise<string[]>;
  /** Presses a key with the focus on the company field. */
  pressInCompanyField(key: string): Promise<void>;
  /** The note under the company field; empty when there is none. */
  companyNote(): Promise<string>;
  /** The name the download will get, as the field shows it. */
  fileNameField(): Promise<string>;

  /** Brings a company into the form, as choosing it from the search does. */
  applyCompany(company: CompanyRecord): Promise<void>;
  /** Brings one of the user's own companies into the form. */
  applyOwnCompany(index: number): Promise<void>;
  /** Brings a company of whoever chose this user as substitute; returns the notices raised. */
  applySubstituteCompany(index: number): Promise<string[]>;
  /** The flyer option the generator would use for a company. */
  destinationOption(company: CompanyRecord): Promise<number>;
  refreshSubstitutes(): Promise<void>;

  /** Runs the check that follows a download: it may open the update dialog. */
  reviewChangesAfterDownload(): Promise<void>;
  waitForUpdateDialog(): Promise<UpdateDialog>;
  updateDialogIsOpen(): Promise<boolean>;
  acceptUpdateDialog(): Promise<void>;
  dismissUpdateDialog(): Promise<void>;
  /** Presses the button that says no; asking again is the rule to test. */
  declineUpdateDialog(): Promise<void>;
  /** Clicks the dark area around the dialog. */
  clickOutsideUpdateDialog(): Promise<void>;
  /** The parts of the dialog painted as a loss: red items and its alert. */
  updateDialogLosses(): Promise<{ redItems: string[]; alert: string; redColor: string }>;
  fillTaxIdInDialog(text: string): Promise<void>;
  /** What the dialog says about the tax ids written. */
  updateDialogTaxIdNote(): Promise<string>;
  /** Saves over a company what a flyer changed, and reads back what it ended up with. */
  saveFlyerChanges(
    index: number,
    change: { cashback: string; officers: CompanyOfficer[] },
  ): Promise<SavedCompanyState>;

  showGenerator(): Promise<void>;
  /** Shows the generator while the companies are read again from the network. */
  showGeneratorAndLoad(): Promise<void>;
  hideGenerator(): Promise<void>;
  generatorText(): Promise<string>;
  generatorRowCount(): Promise<number>;
  openGeneratorWith(companies: CompanyRecord[]): Promise<void>;
  tickInGenerator(rows: number[]): Promise<GeneratorTicks>;
  filterGenerator(text: string): Promise<string[]>;
  /** Generates a PDF for each company and confirms the question it asks first. */
  generateFlyers(companies: CompanyRecord[]): Promise<FlyerGeneration>;

  openRegistry(): Promise<void>;
  closeRegistry(): Promise<void>;
  /** The solapas of Base de datos, as they read; empty when it has a single pane. */
  databaseTabs(): Promise<string[]>;
  chooseDatabaseTab(label: string): Promise<void>;
  /** What Base de datos says about the companies saved. */
  registryStatus(): Promise<string>;
  /** Chooses a spreadsheet with these lines in Subir Excel. */
  uploadRegistrySheet(lines: string[][]): Promise<void>;
  /** Presses Cancelar on the summary of what a sheet would change. */
  dismissImport(): Promise<void>;
  /** Presses a download of Mis empresas and reads the sheet that comes out. */
  downloadRegistrySheet(kind: "companies" | "template"): Promise<RegistrySheet>;
  /** The name the template of Mis empresas downloads under. */
  templateName(): Promise<string>;
  /** Presses Editar en línea over what is saved. */
  openInlineEditor(): Promise<void>;
  saveInlineEditor(): Promise<void>;
  renameInEditor(row: number, name: string): Promise<void>;
  /** Mis asesores: the rows as they can be edited. */
  advisorsInDatabase(): Promise<string[]>;
  editAdvisorInDatabase(row: number, name: string): Promise<void>;
  saveAdvisorsInDatabase(): Promise<void>;
  /** The company screen an administrator uses to look at someone else's list. */
  openOtherUsersCompanies(): Promise<void>;
  otherUsersOffered(): Promise<string[]>;
  chooseOtherUser(name: string): Promise<void>;
  otherUserCompanies(): Promise<string[]>;
  otherUserScreenHasEditing(): Promise<boolean>;
  /** Makes the current flyer eligible as a category, of that kind when one is given. */
  offerCurrentFlyerAsCategory(kind?: string): Promise<number>;
  openEditorWith(companies: CompanyRecord[]): Promise<void>;
  filterEditor(text: string): Promise<void>;
  chooseCategoryFlyer(row: number): Promise<void>;
  capFields(row: number): Promise<CapField[] | null>;
  writeCaps(row: number, caps: string[]): Promise<void>;
  editorCategory(row: number): Promise<CompanyCategory>;
  expandOfficers(rows: number[]): Promise<void>;
  /** Companies whose officers are expanded right now. */
  expandedCompanies(): Promise<string[]>;
  officerFieldsShown(): Promise<number>;
  /** Deletes a row and confirms. */
  removeFromEditor(row: number): Promise<void>;

  sheetColumns(): Promise<string[]>;
  exportAndReadBack(companies: CompanyRecord[]): Promise<SheetExport>;
  /** The caps a single sheet row gives. */
  capsOfSheetRow(cells: Record<string, string>): Promise<CompanyCategory>;
  validateSheet(rows: SheetRow[]): Promise<SheetValidation>;

  /** The changes others asked for and wait for this user's decision. */
  pendingProposals(): Promise<PendingProposal[]>;
  /** Presses a button on the first proposal, writes the text it asks and confirms. */
  answerProposal(button: string, text: string): Promise<void>;

  /** Shows the company list of the Hunter profile, reading it from the network. */
  loadHunterList(): Promise<void>;
  waitForHunterConnectionProblem(): Promise<void>;
  hunterList(): Promise<HunterList>;
  retryHunterList(): Promise<void>;
  waitForHunterCompanies(count: number): Promise<void>;
  /** Asks again which options have a flyer. */
  checkHunterFlyers(): Promise<HunterFlyers>;
}
