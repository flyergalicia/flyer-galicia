export type StudioFilter = "mine" | "all" | "requests";

export interface StudioCard {
  id: string;
  name: string;
  /** The state as the card reads it. */
  status: string;
  /** Labels of its buttons, in order. */
  buttons: string[];
  /** Messages of the conversation shown on the card. */
  messages: number;
  conversation: string;
  /** "Te lo compartió ...", when it is a copy. */
  sharedNote: string;
}

export interface DesignToSave {
  name?: string;
  company?: string;
}

export interface SaveDialog {
  text: string;
  /** It offers to save over the design already open. */
  offersSameDesign: boolean;
  /** It offers a choice between that design and a new one. */
  offersChoice: boolean;
}

export interface ShareDialog {
  people: string[];
  text: string;
  confirmEnabled: boolean;
  confirmLabel: string;
}

export interface HeaderMessages {
  visible: boolean;
  explanation: string;
}

export interface LostUploadReading {
  key: string;
  notice: string;
  changes: number;
  openedInTab: boolean;
}

export interface NoRoomForDrafts {
  /** How many uploaded logos each saved draft kept. */
  savedLogos: number[];
  firstNotice: string;
  pendingKeepsItsLogo: boolean;
  openDraftLogos: number;
  secondNotice: string;
  warnedNoRoom: boolean;
}

export interface SameKeyColors {
  first: number[];
  second: number[];
  third: number[];
}

/** What specs can do on Estudio and with the designs it keeps. */
export interface StudioDriver {
  isTabVisible(): Promise<boolean>;
  /** Touches the Estudio tab and waits for its list. */
  open(): Promise<void>;
  /** Waits for a card with those buttons to be on screen. */
  waitForCards(): Promise<void>;
  /** Reads the list from the cloud again. */
  reloadList(): Promise<void>;
  /** What the periodic refresh does, without waiting for its turn. */
  refreshNow(): Promise<void>;
  cards(): Promise<StudioCard[]>;
  /** Labels of the filters with their counts. */
  filters(): Promise<string[]>;
  showFilter(filter: StudioFilter): Promise<void>;
  /** The number on the Estudio tab; empty when it is not shown. */
  tabBadge(): Promise<string>;
  headerMessages(): Promise<HeaderMessages>;
  /** What the app knows without opening Estudio: open questions on my designs. */
  openQuestions(): Promise<number>;
  waitForOpenQuestions(count: number): Promise<void>;
  waitForSharedWithMe(count: number): Promise<void>;
  /** The explanation under the Estudio title. */
  intro(): Promise<string>;
  savedBrandsSectionShown(): Promise<boolean>;
  waitForConversation(messages: number): Promise<void>;
  waitForStatus(status: string): Promise<void>;

  // Saving from the logo editor
  saveButton(): Promise<{ visible: boolean; label: string }>;
  /** The label of the design open in the logo editor. */
  openDesignLabel(): Promise<string>;
  /** Presses Guardar en Estudio and reads the window. */
  openSaveDialog(): Promise<SaveDialog>;
  /** Fills the window and presses Guardar. */
  confirmSave(design: DesignToSave): Promise<void>;
  /** Presses Guardar en Estudio and saves. */
  save(design: DesignToSave): Promise<void>;
  /** A sign on the page that the logo uploaded from the computer is in memory. */
  uploadedLogoInMemory(): Promise<boolean>;

  // Actions on a card; without an id, on the first card
  use(id?: string): Promise<void>;
  requestPublication(): Promise<void>;
  openCompleteView(): Promise<{ height: number }>;
  closeCompleteView(): Promise<void>;
  completeViewOpen(): Promise<boolean>;
  approveVisibleInCompleteView(): Promise<boolean>;
  /** Presses Aprobar y publicar, names the flyer and waits for the publication to end. */
  approve(flyerName: string): Promise<void>;
  /** Presses No aprobar, writes the note and waits for the card to change. */
  reject(note: string): Promise<void>;
  ask(question: string): Promise<void>;
  answer(text: string): Promise<void>;

  /** Presses Aprobar y publicar, names the flyer and tries to publish again meanwhile. */
  approveTwiceAtOnce(design: string, flyerName: string, secondName: string): Promise<void>;
  /** Publishes without going through the card, as the end of an approval does. */
  publishDirectly(design: string, option: number, flyerName: string): Promise<void>;

  // Sharing
  openShareDialog(options?: { onlyOriginalDesign: boolean }): Promise<void>;
  shareDialog(): Promise<ShareDialog>;
  searchPeopleToShare(text: string): Promise<void>;
  tickFirstPersonToShare(): Promise<void>;
  confirmShare(): Promise<void>;
  /** The profile of this user enables that flyer. */
  profileHasOption(option: number): Promise<boolean>;
  /** This user can use that flyer now, for any reason. */
  canUseOption(option: number): Promise<boolean>;

  // Flyers to copy
  sourcesButtonLabel(): Promise<string>;
  waitForSourcesButton(): Promise<void>;
  /** Picks a file with "Proponer un flyer" or "Subir un flyer", names it and waits. */
  proposeSource(
    file: { name: string; mimeType: string; buffer: Buffer },
    name: string,
  ): Promise<void>;
  waitForSourceToApprove(): Promise<void>;
  approveFirstSource(): Promise<void>;
  /** Presses Quitar on that source and confirms. */
  removeSource(id: string): Promise<void>;
  /** Tries to save the list of sources when reading it answers 403; returns what happened. */
  saveSourcesWhenListIsForbidden(): Promise<string>;

  // Logos uploaded from the computer
  /** Keys of two uploads of a file, and of a third one as after reloading the page. */
  uploadKeysOfSameFile(file: Buffer, name: string): Promise<string[]>;
  /** Saves a history entry with an uploaded logo, forgets the logo and loads the entry. */
  reopenHistoryWithLostUpload(file: Buffer, name: string): Promise<LostUploadReading>;
  /** Opens the save window of the design on screen, which keeps no copy of the logo. */
  saveDialogTextWithoutStoredUpload(): Promise<string>;
  /** The same, on a design that does keep a copy of the logo; it stays open. */
  saveDialogTextWithStoredUpload(key: string, file: Buffer): Promise<string>;
  /** Fills the name in the save window that is open and saves. */
  fillSaveDialogAndSave(name: string): Promise<void>;
  /** Pixel colors of a logo loaded by three designs sharing one key: red, blue, red. */
  colorsOfDesignsSharingKey(): Promise<SameKeyColors>;
  /** Saves drafts when the browser has no room, first for their logos, then for anything. */
  saveDraftsWithoutRoom(file: Buffer): Promise<NoRoomForDrafts>;
  /** Recovers a draft whose uploaded logo could not be kept; returns the notice. */
  recoverDraftWithLostUpload(): Promise<string>;
  /** Presses download on a history entry whose uploaded logo is lost, and reads the question. */
  redownloadHistoryWithLostUpload(): Promise<string>;

  // Config → Flyer, which also lists what Estudio publishes
  /** Presses Desactivar on a flyer and reads the question it asks. */
  askToDeactivateFlyer(option: number): Promise<string>;
  /** The text of the list of flyers, once it has loaded. */
  flyerListOfConfig(): Promise<string>;
  /** Names of the designs Estudio has listed. */
  listedDesigns(): Promise<string[]>;
}
