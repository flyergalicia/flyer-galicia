export interface SearchPanelLayout {
  left: number;
  right: number;
  windowWidth: number;
  /** Width of the page: more than the window means it scrolls sideways. */
  pageWidth: number;
  fieldFontSizePx: number;
}

/** What specs can do on el buscador de pantallas. */
export interface SearchDriver {
  /** Opens it with the keyboard, unless it is open, and leaves that text in its field. */
  search(text: string): Promise<void>;
  /** Searches and presses Enter: what a user does to jump somewhere. */
  goTo(text: string): Promise<void>;
  /** Titles of the results, in order. */
  results(): Promise<string[]>;
  /** Each result with all it shows: title, where it is from... */
  resultLines(): Promise<string[]>;
  /** Headings of the groups of results, in order. */
  groups(): Promise<string[]>;
  /** Position of the marked result in the list; -1 if none is. */
  markedResult(): Promise<number>;
  /** What the header button says about the shortcut on that system. */
  shortcutLabelOn(system: "windows" | "mac"): Promise<string>;
  /** Presses the shortcut without a session: did it open, did the app keep the key? */
  shortcutWithoutSession(): Promise<{ opened: boolean; appKeptTheKey: boolean }>;
  /** Whether markup written as text became HTML in the list, or ran its script. */
  injectedMarkup(): Promise<{ ranScript: boolean; imageInList: boolean }>;
  panelColors(): Promise<{ background: string; text: string }>;
  panelLayout(): Promise<SearchPanelLayout>;
}
