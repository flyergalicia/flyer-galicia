export interface UsageSection {
  title: string;
  rows: { label: string; count: string }[];
}

export interface UsageBoard {
  /** The big numbers at the top, in order: flyers, users, flyers per user. */
  totals: string[];
  sections: UsageSection[];
}

export interface FacultyRow {
  /** Its name, as it reads. */
  name: string;
  /** Column by column, "Vos" first: true ticked, false not ticked, null not applicable. */
  ticks: Record<string, boolean | null>;
  /** It can be seen, which depends on its group being unfolded. */
  visible: boolean;
}

export interface OptionRow {
  number: number;
  name: string;
  tab: string;
  /** The text of the choice "Reemplaza a"; null when there is none. */
  replaces: string | null;
  isCurrent: boolean;
  status: string;
}

export interface UserRow {
  name: string;
  /** Its mail and last access, as the row reads. */
  details: string;
  /** Profile and status. */
  badges: string[];
  /** What can be done on it, by the text of its buttons. */
  actions: string[];
  canBeDeleted: boolean;
}

export interface UserFormFields {
  name?: string;
  email?: string;
  password?: string;
  /** By the text of the choice. */
  profile?: string;
  status?: string;
  leader?: string;
}

export interface UserFormSendAccess {
  to: string;
  greeting: string;
}

/** What specs can do on el panel de administración. */
export interface AdminDriver {
  /** Presses the header button that opens the panel. */
  openPanel(): Promise<void>;
  closePanel(): Promise<void>;
  isPanelOpen(): Promise<boolean>;

  /** The three pillars of the panel and the sheets of each, as they read. */
  panelStructure(): Promise<Record<string, string[]>>;
  /** Touches the pillar and the sheet. */
  openSheet(pillar: "Admin" | "Data" | "Config", sheet: string): Promise<void>;
  /** Presses a button that exports and reads the sheet that comes out. */
  exportSheet(button: string): Promise<{ head: string[]; rows: string[][] }>;
  /** All the text the sheet on screen says. */
  sheetText(): Promise<string>;

  /** Opens Admin → Uso and waits for its numbers. */
  openUsage(): Promise<void>;
  usageBoard(): Promise<UsageBoard>;
  /** Chooses the period of Uso and waits for the numbers of that period. */
  selectUsagePeriod(days: 30 | 90 | 365): Promise<void>;
  /** The board has to be scrolled sideways to be read. */
  usageOverflowsSideways(): Promise<boolean>;

  /** Opens Admin → Usuarios and waits for its list. */
  openUsers(): Promise<void>;
  userRows(): Promise<UserRow[]>;
  /** Presses a button on the row of that person. */
  pressUserAction(name: string, action: string): Promise<void>;
  /** Presses the bin on the row of that person. */
  pressDeleteUser(name: string): Promise<void>;
  /** The number on the button that opens the panel; empty when it has none. */
  pendingUsersBadge(): Promise<string>;
  /** Writes in the form of a user. */
  fillUserForm(fields: UserFormFields): Promise<void>;
  /** The text of the button that saves the form, and whether it can be pressed. */
  userFormButton(): Promise<{ text: string; locked: boolean }>;
  /** Presses "+ Nuevo usuario". */
  openNewUserForm(): Promise<void>;
  /** Presses Editar on the row of that person. */
  openEditUserForm(name: string): Promise<void>;
  setUserFormPassword(password: string): Promise<void>;
  /** The option "Enviar usuario y contraseña por mail" can be seen. */
  sendAccessOptionVisible(): Promise<boolean>;
  sendAccessOptionChecked(): Promise<boolean>;
  checkSendAccess(): Promise<void>;
  /** The fields "Enviar a" and the name for the greeting can be seen. */
  sendAccessFieldsVisible(): Promise<boolean>;
  sendAccessFields(): Promise<UserFormSendAccess>;
  fillSendAccess(fields: Partial<UserFormSendAccess>): Promise<void>;
  /** The profiles the form offers. */
  userFormProfiles(): Promise<string[]>;
  /** Presses the button that saves the form; it does not wait for the outcome. */
  submitUserForm(): Promise<void>;
  /** Waits until the form is gone. */
  waitForUserFormClosed(): Promise<void>;
  /** What the form says went wrong; empty when nothing did. */
  userFormError(): Promise<string>;

  /** Admin → Facultades: the rows of the matrix. */
  facultyRows(): Promise<FacultyRow[]>;
  /** Ticks or unticks that row on that column. */
  setFaculty(row: string, column: string, on: boolean): Promise<void>;
  /** Unfolds or folds the group of flyers of a tab. */
  toggleFacultyGroup(tab: string): Promise<void>;
  /** The header of the group of a tab: how many of its flyers each column has. */
  facultyGroup(tab: string): Promise<{ name: string; counts: Record<string, string> } | null>;
  saveFaculties(): Promise<void>;
  /** Unticks in the column "Vos" every flyer, one after the other. */
  untickAllOwnFlyers(): Promise<void>;
  /** Touches the eye of a profile: the app is seen as that profile sees it. */
  previewProfile(profile: string): Promise<void>;
  /** Presses the button of the bar that leaves the preview. */
  leaveProfilePreview(): Promise<void>;
  previewBarText(): Promise<string>;

  /** Config → Opciones. */
  optionRows(): Promise<OptionRow[]>;
  pressAddOption(): Promise<void>;
  renameOptionRow(index: number, name: string): Promise<void>;
  chooseOptionTab(index: number, tab: string): Promise<void>;
  chooseOptionReplaces(index: number, label: string): Promise<void>;
  saveOptions(): Promise<void>;

  /** Config → Cashback: the amounts of each configuration. */
  cashbackConfigs(): Promise<string[][]>;
  setCashbackAmount(config: number, amount: number, value: string): Promise<void>;
  saveCashback(): Promise<void>;

  /** Config → Legales. */
  legalTabs(): Promise<string[]>;
  chooseLegalTab(name: string): Promise<void>;
  legalMarkers(): Promise<string[]>;
  /** Puts the cursor at the end of the text and presses a marker. */
  pressLegalMarker(name: string): Promise<void>;
  legalText(): Promise<string>;
  fillLegal(text: string): Promise<void>;
  saveLegal(): Promise<void>;
}
