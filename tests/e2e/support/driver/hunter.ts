export interface HunterRow {
  company: string;
  /** Which flyer it would use, as the row says. */
  flyer: string;
  /** Warnings of the row. */
  warnings: string;
  canDraw: boolean;
  /** "✎ Oficiales" is offered. */
  canPropose: boolean;
  /** The tag that says a proposal is waiting. */
  proposalTag: string;
}

export interface HunterPreview {
  shown: boolean;
  /** What the empty place of the preview says. */
  message: string;
  canDownload: boolean;
}

export interface ProposalThread {
  company: string;
  text: string;
  /** Who can do what on it. */
  buttons: string[];
}

/** What specs can do on the screen of the Hunter profile. */
export interface HunterDriver {
  /** Waits for the list, ready to search in. */
  waitForList(): Promise<void>;
  status(): Promise<string>;
  rows(): Promise<HunterRow[]>;
  search(text: string): Promise<void>;
  /** Presses a key with the focus on the search field. */
  pressInSearch(key: string): Promise<void>;
  choose(company: string): Promise<void>;
  /** Waits until the preview shows the flyer or says why it cannot. */
  waitForPreview(): Promise<HunterPreview>;
  /** Presses Descargar PDF and reads the name of the file. */
  download(): Promise<string>;
  /** The texts of the flyer on the preview. */
  drawnTexts(): Promise<string[]>;
  /** Turns the wheel over the preview, with or without Ctrl, and reads the zoom. */
  wheel(ctrl: boolean): Promise<number>;
  zoomPercent(): Promise<number>;

  startMultiple(): Promise<void>;
  tick(company: string): Promise<void>;
  /** The chosen companies, always in sight on top. */
  ticked(): Promise<string[]>;
  untick(company: string): Promise<void>;
  /** Presses Ctrl+Enter with the focus on the search field and reads the ZIP name. */
  downloadTickedWithShortcut(): Promise<string>;

  /** Presses "✎ Oficiales" of a company. */
  openProposal(company: string): Promise<void>;
  proposalTitle(): Promise<string>;
  fillProposalOfficer(slot: number, name: string, phone: string): Promise<void>;
  fillProposalNote(text: string): Promise<void>;
  sendProposal(): Promise<void>;
  /** The button that sends it can be pressed. */
  canSendProposal(): Promise<boolean>;
  /** The conversation shown in the window of the answer. */
  proposalWindowText(): Promise<string>;
  /** The officers the window has, as they read now. */
  proposalOfficerName(slot: number): Promise<string>;
  proposalWindowOpen(): Promise<boolean>;
  /** Opens Mis propuestas from the name menu. */
  openMyProposals(): Promise<void>;
  myProposals(): Promise<ProposalThread[]>;
  /** Presses Responder on the one that waits for this user. */
  pressAnswer(company: string): Promise<void>;
}
