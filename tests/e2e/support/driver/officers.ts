import { type OfficerFields } from "./flyer-editor.ts";

export interface PasteOutcome {
  /** What the box says it recognized. */
  recognized: { name: boolean; phone: boolean; email: boolean };
  /** All it says, warnings included. */
  text: string;
}

export interface OfficerControl {
  label: string;
  /** Pixels a finger has to touch. */
  height: number;
  /** It can be reached with Tab and announced as a button. */
  isKeyboardButton: boolean;
}

/** What specs can do on the Oficiales card of the form. */
export interface OfficersDriver {
  read(officer: number): Promise<OfficerFields>;
  /** Writes in the fields the way a user does, so whatever listens to them reacts. */
  fill(officer: number, fields: Partial<OfficerFields>): Promise<void>;
  /** Officers whose block can be seen. */
  shownBlocks(): Promise<number[]>;
  /** The text of the button that adds another officer; null when it is not offered. */
  addButtonLabel(): Promise<string | null>;
  pressAdd(): Promise<void>;
  /** Presses the ✕ of that block. */
  pressRemove(officer: number): Promise<void>;
  /** The controls in the title of that block. */
  controls(officer: number): Promise<OfficerControl[]>;
  /** The switch "Mostrar en el flyer". */
  switchIsOn(): Promise<boolean>;
  pressSwitch(): Promise<void>;
  /** The card shows its message instead of the officers. */
  blocksHiddenBySwitch(): Promise<boolean>;

  /** Officers that offer "Pegar". */
  pasteOffered(): Promise<number[]>;
  pressPaste(officer: number): Promise<void>;
  /** Takes the focus to "Pegar" and presses Enter. */
  pressPasteWithKeyboard(officer: number): Promise<void>;
  pasteBoxOpen(officer: number): Promise<boolean>;
  /** Writes in the box and waits for what it understood. */
  pasteText(officer: number, text: string): Promise<PasteOutcome>;
  undoPaste(officer: number): Promise<void>;

  /** Opens the list of saved advisors on that officer. */
  openSavedAdvisors(officer: number): Promise<void>;
  advisorsListTitle(): Promise<string>;
  savedAdvisors(): Promise<string[]>;
  /** Presses "+ Guardar el actual" of the open list and answers the name it asks. */
  saveCurrentAdvisorAs(name: string): Promise<void>;
  chooseSavedAdvisor(name: string): Promise<void>;
  /** Presses the ✕ of a saved advisor. */
  pressDeleteSavedAdvisor(name: string): Promise<void>;
}
