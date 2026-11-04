import { type OfficerFields } from "./flyer-editor.ts";

export interface DownloadedFile {
  name: string;
  bytes: Buffer;
}

export interface FlyerForm {
  company: string;
  officers: OfficerFields[];
}

/** The way out of the flyer, through the same buttons a user presses. */
export interface FlyerOutputDriver {
  /** Writes in the fields of the form; each officer past the first one is added with its button. */
  fillForm(form: FlyerForm): Promise<void>;
  /** Flips the "Mostrar en el flyer" switch of Oficiales. */
  toggleOfficersOnFlyer(): Promise<void>;
  pressDownloadPdf(): Promise<DownloadedFile>;
  /** Opens "Otros" and presses its image download. */
  pressDownloadPng(): Promise<DownloadedFile>;
  /** Goes to Masivo and presses Generar ZIP, with a spreadsheet already chosen. */
  pressGenerateZip(): Promise<DownloadedFile>;
}
