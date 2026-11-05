/**
 * What the shell gives to the screen of a tab. A screen stays mounted when another tab is on top,
 * so that what was being done is still there on coming back: `isActive` says whether it is showing.
 */
export interface ViewProps {
  readonly isActive: boolean;
  /** The tab it opened from: the flyer editor is one screen for three tabs. */
  readonly tabId: string;
  /** Takes the person to another tab: a screen does not know where the others live. */
  readonly goToTab?: (tabId: string) => void;
  /** Opens a window of the name menu, by its id: `database`. */
  readonly openMenuWindow?: (windowId: string) => void;
}

/** What the shell gives to a window of the name menu. */
export interface MenuWindowProps {
  readonly onClose: () => void;
}

/** Something waiting for the person: a slice reports it, and the header shows it. */
export interface WaitingNotice {
  /** How many things there are. With 0, nothing shows. */
  readonly count: number;
  /** What they are, for when the mouse rests on the name: "1 novedad en Gestiones". */
  readonly hint: string;
  /** The tab that carries the number too. */
  readonly tabId?: string;
}

/**
 * What a slice gives the shell to report what is waiting. It stays mounted while the person is
 * inside, whichever screen is on top, and it draws nothing: its code goes in the first load, so it
 * has to stay small, apart from the screen of its slice.
 */
export interface NoticeSourceProps {
  readonly report: (notice: WaitingNotice) => void;
}
