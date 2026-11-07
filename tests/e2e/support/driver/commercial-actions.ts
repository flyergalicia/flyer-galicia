/** The solapas of Gestiones. Not every person has all of them. */
export type CommercialTab = "companies" | "actions" | "agenda" | "dashboard";

export type ActionType = "action" | "fair" | "commercial-position" | "data-list";
export type CompanyFilter = "all" | "forwarded" | "not-forwarded" | "with-signups";
export type AgendaDirection = "previous" | "today" | "next";
/** The two trays of the agenda that lead to the window that assigns a hunter. */
export type AssignmentTray = "unassigned" | "reassign-requests";
export type PersonOutcome = "signup" | "discarded";

/** The window of a person who needs a hunter, a date or a time. */
export interface ActionFormDriver {
  /** Opens the window that forwards one of my companies. */
  startForwarding(company: string): Promise<void>;
  /** Opens the window of the agenda: "+ Asignar", or "+ Agendar" for a hunter. */
  startScheduling(): Promise<void>;
  /** The types the window offers, as they read. */
  actionTypeChoices(): Promise<string[]>;
  chooseActionType(type: ActionType): Promise<void>;
  /** Which parts of the window are showing. */
  formSections(): Promise<{ schedule: boolean; peopleList: boolean; leader: boolean }>;
  /** Every option of the Hunter field. */
  hunterChoices(): Promise<string[]>;
  chooseHunter(name: string): Promise<void>;
  /** Leaves the action for the leader to assign. */
  leaveToLeader(): Promise<void>;
  /** Every option of the field of the leader who will assign. */
  leaderChoices(): Promise<string[]>;
  setDate(date: string): Promise<void>;
  setTimes(from: string, to: string): Promise<void>;
  /** What the window has as date and time right now. */
  schedule(): Promise<{ date: string; from: string; to: string }>;
  /** Pastes the people of a data list and returns its summary. */
  pastePeople(text: string): Promise<string>;
  /** Waits for the notice of a time that overlaps, with who is free at that time. */
  waitForOverlapNotice(): Promise<{ text: string; freeHunters: string[] }>;
  /** Takes one of the hunters the notice offers as free. */
  chooseFreeHunter(name: string): Promise<void>;
  /** Presses Derivar. */
  confirmForwarding(): Promise<void>;
  /** Presses the button that saves the hunter of an action that already exists. */
  confirmAssignment(): Promise<void>;
  /** Waits for the week of the hunter that the window shows; null if it never appears. */
  waitForHunterWeek(): Promise<HunterWeekPanel | null>;
  /** Touches a free spot of the week, some hours below the top of its first day. */
  touchHunterWeek(hoursBelowTop: number): Promise<void>;
  /** Sizes of that week and of the window around it. */
  hunterWeekSizes(): Promise<HunterWeekSizes>;
}

export interface AgendaPasteRow {
  date: string;
  time: string;
  company: string;
  hunter: string;
  place: string;
  /** "Lista", or what is wrong with it. */
  status: string;
}

export interface AgendaPasteReview {
  /** The counters over the table. */
  summary: string;
  rows: AgendaPasteRow[];
  addButton: { text: string; locked: boolean };
}

/** The window of Asignar and Agendar that starts from a company, and Pegar desde Excel. */
export interface AgendaAssignDriver {
  /** Writes in the field of the company. */
  searchCompanyToAssign(text: string): Promise<void>;
  /** What the search under that field says: its buttons, or its message. */
  companySearchResults(): Promise<string>;
  chooseCompanyFound(name: string): Promise<void>;
  /** Presses the button that saves the window. */
  confirmAgendaAction(): Promise<void>;
  /** Presses "Pegar desde Excel". */
  openAgendaPaste(): Promise<void>;
  agendaPasteOffered(): Promise<boolean>;
  /** Writes the lines in the window, as pasting from a spreadsheet does. */
  pasteAgenda(text: string): Promise<void>;
  /** What the window says under the lines right now, reviewed or not. */
  agendaPreviewText(): Promise<string>;
  /** Waits until the lines are reviewed against the database. */
  waitForAgendaReview(): Promise<AgendaPasteReview>;
  /** Presses "Probar de nuevo", offered when a line could not be reviewed. */
  retryAgendaReview(): Promise<void>;
  /** Presses "Agregar N a la agenda". */
  addPastedAgenda(): Promise<void>;
}

export interface HunterWeekPanel {
  title: string;
  blocks: number;
  /** Blocks that open something when touched: the week is only for looking. */
  blocksThatOpen: number;
}

export interface HunterWeekSizes {
  panelWidth: number;
  windowWidth: number;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Any window open over Gestiones. */
export interface DialogDriver {
  dialogIsOpen(): Promise<boolean>;
  /** The text of the window; empty if there is none. */
  dialogText(): Promise<string>;
  waitForDialogText(pattern: RegExp): Promise<string>;
  /** False if the window was still open after waiting. */
  waitForDialogToClose(): Promise<boolean>;
  /** Presses one of the options a choosing window offers, by how it reads. */
  chooseInDialog(option: string): Promise<void>;
  /** Presses Cancelar or Cerrar. */
  dismissDialog(): Promise<void>;
}

export interface PersonOfAction {
  id: string;
  name: string;
  status: string;
  package: string | null;
  reason: string | null;
}

/** An action opened, with its people, conversation and history. */
export interface ActionDetailDriver {
  openAction(id: string): Promise<void>;
  /** Presses "← Volver". */
  leaveAction(): Promise<void>;
  /** False if it still has messages to read after waiting. */
  waitForActionToBeRead(): Promise<boolean>;
  sendMessage(text: string): Promise<void>;
  /** Asks the cloud again: the ids of the actions with messages I did not read. */
  actionsWithUnreadMessages(): Promise<string[]>;
  /** The buttons the action offers to this person. */
  actionCommands(): Promise<string[]>;
  /** Presses "No puedo ir" and tells why. */
  reportCannotAttend(reason: string): Promise<void>;
  people(): Promise<PersonOfAction[]>;
  waitForPeople(isDone: (people: PersonOfAction[]) => boolean): Promise<PersonOfAction[]>;
  /** Moves a person on its Estado field. Some outcomes then ask something in a window. */
  movePerson(name: string, outcome: PersonOutcome): Promise<void>;
  /** The list that could not be loaded and stays pasted to try again. */
  waitForPastedList(): Promise<{ text: string; sectionOpen: boolean }>;
  addPastedList(): Promise<void>;
  /** Presses "Dejar sin leer". */
  markActionUnread(): Promise<void>;
  /** The row marked when arriving from "Para contactar"; empty if there is none. */
  waitForHighlightedPerson(): Promise<string>;
  waitForNoHighlightedPerson(): Promise<boolean>;
}

/** Writes straight to the database as this person, as if skipping the screen. */
export interface BehindTheScreenDriver {
  /** Returns the error of the database, null if it took it. */
  insertActionBehindTheScreen(row: Record<string, unknown>): Promise<string | null>;
  updateActionBehindTheScreen(id: string, changes: Record<string, unknown>): Promise<string | null>;
  updatePersonBehindTheScreen(id: string, changes: Record<string, unknown>): Promise<string | null>;
}

export type AgendaLayout = "hours" | "team" | "month";

export interface TakenBlocks {
  count: number;
  /** How many of them open something when touched. */
  thatOpen: number;
}

export interface AgendaDriver {
  /** Presses Semana, Día, Día del equipo or Mes. */
  chooseAgendaView(label: string): Promise<void>;
  /** The view that shows as pressed. */
  agendaViewShown(): Promise<string>;
  /** False if that layout was not on screen after waiting. */
  waitForAgendaLayout(layout: AgendaLayout): Promise<boolean>;
  /** How many columns of hours are showing. */
  agendaDayColumns(): Promise<number>;
  /** Chooses in "Agenda de" whose week to look at. */
  chooseWhoseAgenda(name: string): Promise<void>;
  takenBlocks(): Promise<TakenBlocks>;
  /** The label beside the arrows. */
  agendaRangeLabel(): Promise<string>;
  /** The month being looked at, as YYYY-MM. */
  agendaMonth(): Promise<string>;
  moveAgenda(direction: AgendaDirection): Promise<void>;
  /** Moves to the month of that date if it is another one. */
  showMonthOf(date: string): Promise<void>;
  /** The day being looked at and the heading of its column. */
  agendaDayShown(): Promise<{ date: string; heading: string }>;
  /** Opens the window with everybody to contact. */
  openContactList(): Promise<void>;
  /** Presses a person on that window. */
  chooseContact(name: string): Promise<void>;
  /** Presses an action on one of the trays of the agenda. */
  openFromTray(tray: AssignmentTray, company: string): Promise<void>;
}

export interface CompaniesDriver {
  /** Chooses the filter of Mis empresas and returns how many it leaves. */
  filterCompanies(filter: CompanyFilter): Promise<number>;
  companyFilterOptions(): Promise<string[]>;
  searchCompanies(text: string): Promise<void>;
  /** The text of the table of Mis empresas. */
  companiesText(): Promise<string>;
}

export interface ActionRow {
  text: string;
  /** What the row says about its type. */
  type: string;
  /** It asks for attention: a novelty or messages to read. */
  flagged: boolean;
}

export interface ActionListDriver {
  /** Waits for the list on the solapa of the actions and returns its rows. */
  actionRows(): Promise<ActionRow[]>;
  waitForActionRows(isDone: (rows: ActionRow[]) => boolean): Promise<ActionRow[]>;
  searchActions(text: string): Promise<void>;
  /** Chooses in the filter of types, by how it reads. */
  filterActionsByType(label: string): Promise<void>;
  filterActionsFrom(date: string): Promise<void>;
  filterActionsUntil(date: string): Promise<void>;
  /** Chooses in the filter of states, by how it reads. */
  filterActionsByStatus(label: string): Promise<void>;
  /** Chooses in the filter of hunters, by how it reads. */
  filterActionsByHunter(label: string): Promise<void>;
  /** "Limpiar filtros" can be seen. */
  clearFiltersOffered(): Promise<boolean>;
  /** Presses "Limpiar filtros". */
  clearActionFilters(): Promise<void>;
}

export interface DashboardFigures {
  actions: number;
  unassigned: number;
  /** The id of each row of hunters; null for a row with no owner. */
  hunterIds: (string | null)[];
  /** The ids of the officers the numbers count. */
  countedOfficerIds: string[];
}

export interface DashboardDriver {
  /** Waits for the numbers of the dashboard. */
  dashboardFigures(): Promise<DashboardFigures>;
  waitForDashboardFigures(
    isDone: (figures: DashboardFigures) => boolean,
  ): Promise<DashboardFigures>;
  /** Chooses in Período, by how it reads, and waits for the numbers. */
  choosePeriod(label: string): Promise<void>;
  /** Every officer the field "Oficial Payroll" offers. */
  officerChoices(): Promise<string[]>;
  /** Chooses one by name, or everybody with null, and waits for the numbers. */
  chooseOfficer(name: string | null): Promise<void>;
  /** The quarters the panel offers, as they start: 1Q, 2Q... */
  quarterChoices(): Promise<string[]>;
  /** The chosen months as two digits, in order. */
  chosenMonths(): Promise<string[]>;
  /** Touches a quarter; adding is the same touch with Shift. */
  touchQuarter(quarter: number, options?: { adding: boolean }): Promise<void>;
  /** Opens a quarter with its arrow and returns how many months it shows. */
  openQuarterMonths(quarter: number): Promise<number>;
  /** Touches a month, as two digits, opening its quarter if needed. */
  touchMonth(month: string, options?: { adding: boolean }): Promise<void>;
  chooseYear(year: number): Promise<void>;
}

export interface TutorialStep {
  title: string;
  /** The highlighted element lives inside Gestiones. */
  pointsInsideCommercialActions: boolean;
}

/** What specs can do on Gestiones. */
export interface CommercialActionsDriver
  extends
    ActionFormDriver,
    AgendaAssignDriver,
    DialogDriver,
    ActionDetailDriver,
    BehindTheScreenDriver,
    AgendaDriver,
    CompaniesDriver,
    ActionListDriver,
    DashboardDriver {
  /** For a window a person watches: its title says whose it is. */
  prepareForDemo(title: string): Promise<void>;
  /** Goes to Gestiones and waits for its solapas. */
  open(): Promise<void>;
  goToTab(tab: CommercialTab): Promise<void>;
  /** The text on screen below the solapas. */
  screenText(): Promise<string>;
  waitForScreenText(pattern: RegExp): Promise<string>;
  /** The same, with the marks around the text: for what should never be printed. */
  screenMarkup(): Promise<string>;
  /** What can be scrolled sideways and should not, once the screen settles. */
  sidewaysOverflow(): Promise<string[]>;
  /** Waits for the screen to stop changing. */
  waitForScreenToSettle(): Promise<void>;
  /** Walks the chapter of Gestiones of the tutorial and leaves it. */
  walkTutorial(): Promise<TutorialStep[]>;
}
