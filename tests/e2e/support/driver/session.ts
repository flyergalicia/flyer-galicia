export interface OpenSessionOptions {
  /** Value of profiles.role of the signed-in user. */
  role: string;
  /** Flyer option to end up in; by default the one this user lands on. */
  startOption?: number;
  /** False returns right after navigating, while the app is still entering. */
  waitUntilReady: boolean;
}

export interface SessionStatus {
  signedIn: boolean;
  loginScreenVisible: boolean;
  /** The app is still on its way in and is not responding to the flyer yet. */
  stillEntering: boolean;
}

export interface SwitchableAccount {
  name: string;
  /** The profile as the user reads it: Hunter, Líder... */
  profile: string;
}

export interface AccountSwitcher {
  heading: string;
  accounts: SwitchableAccount[];
}

/** Places a user can be looking at. */
export type AppScreen =
  | "flyer-editor"
  | "hunter-screen"
  | "flyer-layout"
  | "flyer-individual"
  | "flyer-bulk"
  | "flyer-history"
  | "promotions"
  | "promotions-active"
  | "benchmark"
  | "commercial-actions"
  | "admin-audit"
  | "admin-legal"
  | "my-database";

export interface HeaderFit {
  contentWidth: number;
  visibleWidth: number;
  /** Right edge of the search button. */
  searchButtonRight: number;
  windowWidth: number;
}

/** What is switched on right now. */
export interface AppModes {
  logoEditing: boolean;
  /** Tools on inside the logo editing mode, such as those of its one-letter shortcuts. */
  logoTools: string[];
  /** The solapa of Promociones selected, by its internal name. */
  promotionsTab: string;
  /** The solapa of Gestiones on screen, by its internal name; null while it is not open. */
  commercialActionsTab: string | null;
}

export interface AppColors {
  text: string;
  background: string;
}

/** Whether the pill of a phone reaches the same button as "Descargar PDF". */
export interface PhoneDownloadPill {
  visible: boolean;
  pressesOfTheDownloadButton: number;
  /** Stays marked as the current place, which a button that only acts must not. */
  staysMarked: boolean;
}

export interface DatabaseHelp {
  sections: number;
  allClosed: boolean;
  /** Pixels from the title of the window to "Subir Excel"; null without the button. */
  uploadButtonBelowTitle: number | null;
}

export interface ActivePromotionsHeader {
  counters: string[];
  firstSortOption: string;
}

export interface PromotionsTableFit {
  tableWidth: number;
  screenWidth: number;
  /** CSS display of a row: a grid is a card. */
  rowDisplay: string;
  statusInsideTheScreen: boolean;
}

export type EntryView = "entering" | "login" | "retry" | "register" | "app";

export interface FormMessages {
  error: string;
  ok: string;
  /** The button that sends the form cannot be pressed. */
  locked: boolean;
}

export interface DocumentFit {
  windowHeight: number;
  /** The document scrolls by itself. */
  documentScrolls: boolean;
  /** Height of the editor under the header. */
  editorHeight: number;
  /** The form scrolls inside its own panel. */
  panelScrollsInside: boolean;
  headerHeight: number;
}

export interface HeaderLook {
  logoWidth: number;
  logoHeight: number;
  /** Name of the app: its text and the width it is given. */
  title: string;
  titleFits: boolean;
  fitsTheWindow: boolean;
}

export interface DownloadDock {
  /** Buttons in the fixed bar, in order; empty when there is no bar. */
  buttons: string[];
  /** The bar stays in sight at the end of the panel while scrolling it. */
  stuckToBottom: boolean;
}

export interface SessionDriver {
  open(options: OpenSessionOptions): Promise<void>;
  status(): Promise<SessionStatus>;
  /** Waits until the signed-in user and what they may do are known, for any profile. */
  waitUntilSignedIn(): Promise<void>;
  /** The list of the name menu to jump to another test account; null when it is not offered. */
  accountSwitcher(): Promise<AccountSwitcher | null>;
  /** Touches that account in the name menu. */
  switchToAccount(name: string): Promise<void>;
  /** The browser keeps a list of other accounts or their sessions. */
  browserStoresOtherAccounts(): Promise<boolean>;
  openUserMenu(): Promise<void>;
  /** What the name menu offers, as it reads. */
  userMenuItems(): Promise<string[]>;
  chooseFromUserMenu(label: string): Promise<void>;
  closeUserMenu(): Promise<void>;
  /** That place is on screen right now. */
  isShowing(screen: AppScreen): Promise<boolean>;
  isDarkMode(): Promise<boolean>;
  toggleDarkMode(): Promise<void>;
  headerFit(): Promise<HeaderFit>;
  /** Opens a confirmation window on top of whatever is showing. */
  showConfirmation(message: string): Promise<void>;
  /** Takes away any confirmation window left open. */
  removeConfirmations(): Promise<void>;
  /** Makes the app believe a ZIP is being generated, or that it finished. */
  pretendBatchRunning(running: boolean): Promise<void>;
  /** Waits for a confirmation window and returns all it says. */
  waitForConfirmation(): Promise<string>;
  /** Presses its button: the one that goes ahead, or the one that takes it back. */
  answerConfirmation(goAhead: boolean): Promise<void>;
  confirmationOpen(): Promise<boolean>;
  /** Reloads the page and waits for the flyer it ends up in. */
  reload(option?: number): Promise<void>;
  modes(): Promise<AppModes>;
  /** Which of the entry screens can be seen. */
  entryView(): Promise<EntryView>;
  /** All the entry screen says. */
  entryText(): Promise<string>;
  pressRetryEntry(): Promise<void>;
  /** Reading the stored session stops answering, as when the network drops just then. */
  stallReadingTheSession(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  /** The button that signs in shows it is working. */
  signInButtonBusy(): Promise<boolean>;
  showRegisterForm(): Promise<void>;
  /** Presses the link of the sign-in form that asks for a new password. */
  showForgottenPasswordForm(): Promise<void>;
  submitForgottenPasswordForm(fields: {
    email: string;
    password: string;
    repeat: string;
  }): Promise<void>;
  forgottenPasswordMessages(): Promise<FormMessages>;
  submitRegisterForm(fields: { name: string; email: string; password: string }): Promise<void>;
  registerMessages(): Promise<{ error: string; ok: string; passwordHint: string }>;
  /** The tabs of the header that can be seen, in order. */
  headerTabs(): Promise<string[]>;
  activeHeaderTab(): Promise<string>;
  /** The number on a tab of the header; empty when it has none. */
  headerTabBadge(name: string): Promise<string>;
  chooseHeaderTab(name: string): Promise<void>;
  /** Holds the mouse on a tab as long as needed to lift it, and drags it onto another. */
  dragHeaderTab(name: string, ontoTab: string): Promise<void>;
  /** The preview shows a flyer already. */
  previewPainted(): Promise<boolean>;
  /** Makes the app look for a new version, as it does on its own from time to time. */
  checkForNewVersion(): Promise<void>;
  newVersionNotice(): Promise<string>;
  documentFit(): Promise<DocumentFit>;
  headerLook(): Promise<HeaderLook>;
  downloadDock(): Promise<DownloadDock>;
  /** The floating notices on screen at once. */
  noticesOnScreen(): Promise<number>;
  showNotice(text: string): Promise<void>;
  /** The notice is showing right now. */
  noticeVisible(): Promise<boolean>;
  /** Keeps the mouse on "Descargar PDF" and reads the hint that appears. */
  downloadButtonHint(): Promise<string>;
  /** The smallest letter of the text on screen, with where it is. */
  smallestTexts(limit: number): Promise<{ text: string; size: number; upperCase: boolean }[]>;
  /** The font families in use on screen. */
  fontFamiliesOnScreen(): Promise<string[]>;
  /** The button that opens the panel can be seen. */
  adminButtonOffered(): Promise<boolean>;
  /** The window to change one's own password, from the name menu. */
  openPasswordWindow(): Promise<void>;
  passwordWindowOpen(): Promise<boolean>;
  closePasswordWindow(): Promise<void>;
  submitPasswordWindow(fields: {
    current: string;
    password: string;
    repeat: string;
  }): Promise<void>;
  passwordWindowMessages(): Promise<FormMessages>;
  /** The notes of the name menu. */
  openNotes(): Promise<void>;
  notesOpen(): Promise<boolean>;
  /** What this browser keeps for the app, as it would find it after closing it. */
  browserStorage(): Promise<Record<string, string>>;
  /** The guided tutorial is on screen. */
  tutorialOpen(): Promise<boolean>;
  closeTutorial(): Promise<void>;
  /** Keeps Tab from the tab of a tab list and moves with the arrows. */
  moveAlongEditorTabs(key: "ArrowRight" | "ArrowLeft"): Promise<string>;
  /** Text of the tab of the panel selected now. */
  selectedEditorTab(): Promise<string>;
  /** All the text the user can read on screen. */
  visibleText(): Promise<string>;
  /** Colors of the chosen amounts button. */
  chosenCashbackButtonColors(): Promise<AppColors>;
  /** Text of the title of the amounts card. */
  cashbackCardTitle(): Promise<string>;
  /** Waits until Gestiones is on for this user, for any profile. */
  waitForCommercialActions(): Promise<void>;
  focusCompanyField(): Promise<void>;
  companyFieldHasFocus(): Promise<boolean>;
  /** The flyer this user may use that is not on screen, or null when there is none. */
  anotherAvailableFlyer(): Promise<{ option: number; name: string } | null>;
  currentFlyerOption(): Promise<number>;
  /** How "Descargar PDF" looks when it cannot be pressed. */
  disabledDownloadButtonOpacity(): Promise<number>;
  /** The name a download gets from that pattern and those values. */
  downloadFileName(pattern: string, values: Record<string, string>): Promise<string>;
  selectedFlyerColors(): Promise<AppColors>;
  /** What is behind a logo of Promociones. */
  promotionLogoBackground(): Promise<string>;
  /** Asks for the logo editing mode and leaves it again: did it open? */
  logoEditorOpens(): Promise<boolean>;
  activePromotionsHeader(): Promise<ActivePromotionsHeader>;
  promotionsTableFit(): Promise<PromotionsTableFit>;
  /** Touches the Descargar of the phone pill, without generating the file. */
  pressPhoneDownloadPill(): Promise<PhoneDownloadPill>;
  /** Opens Base de datos, reads how its explanation is laid out and closes it. */
  databaseHelp(): Promise<DatabaseHelp>;
}
