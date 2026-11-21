/** What a calibration says, as far as the tests look. */
export interface CalibrationData {
  imgH?: number;
  empresa?: { fs?: number; peso?: string; color?: string; yc?: number };
  montos?: { y?: number; boxes?: { y?: number; xc: number }[] };
  [zone: string]: unknown;
}

export interface CalibratorZone {
  id: string;
  label: string;
}

export interface CalibratorProperties {
  /** Title of the row of the chosen zone; empty when no zone is chosen. */
  zone: string;
  /** The labels of its fields. */
  fields: string[];
}

export interface EditorSize {
  width: number;
  height: number;
  imageAreaHeight: number;
}

export interface FlyerUpload {
  name: string;
  /** How long browsers may keep the file, as it was asked when uploading. */
  cacheSeconds: string;
}

/** What specs can do when uploading and calibrating a flyer. */
export interface CalibratorDriver {
  /** Accepted by the file field of Config → Flyer. */
  uploadAccepts(): Promise<string>;
  /** Chooses a file in Config → Flyer and waits for the question of which flyer it is for. */
  chooseFlyerFile(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void>;
  uploadError(): Promise<string>;
  /** The options the question offers. */
  optionsAsked(): Promise<string[]>;
  answerOption(label: string): Promise<void>;
  /** Cancels the question. */
  cancelOption(): Promise<void>;
  waitForEditor(): Promise<void>;
  isOpen(): Promise<boolean>;
  title(): Promise<string>;
  zones(): Promise<CalibratorZone[]>;
  chooseZone(id: string): Promise<void>;
  /** The zone chosen now; the rest are not drawn. */
  chosenZone(): Promise<string | null>;
  properties(): Promise<CalibratorProperties>;
  /** Writes in a field of the chosen zone, by its label. */
  setProperty(label: string, value: string): Promise<void>;
  resetProperties(): Promise<void>;
  /** The calibration as it would be saved. */
  calibration(): Promise<CalibrationData>;
  /** Drags the middle of a zone on the image by that many flyer pixels. */
  dragZone(id: string, dx: number, dy: number): Promise<void>;
  /** Chooses a template for the benefit and presses Cargar plantilla. */
  loadBenefitTemplate(name: string): Promise<void>;
  /** The lines of the benefit in the calibration. */
  benefitLines(): Promise<{ text: string; x: number }[]>;
  /** The starting points offered. */
  bases(): Promise<string[]>;
  applyBase(name: string): Promise<void>;
  zoomLabel(): Promise<string>;
  pressZoomIn(times: number): Promise<void>;
  pressZoomReset(): Promise<void>;
  /** Turns the wheel over the image with Ctrl held. */
  wheelZoomIn(times: number): Promise<void>;
  /** Turns the wheel over the image: it scrolls. */
  wheelScroll(): Promise<number>;
  size(): Promise<EditorSize>;
  pressEnlarge(): Promise<void>;
  /** Drags the bar between the image and the controls. */
  dragSplit(dy: number): Promise<void>;
  /** Drags the corner of the editor. */
  dragCorner(dx: number, dy: number): Promise<void>;
  /** Presses Guardar y activar and waits until it closes. */
  saveAndActivate(): Promise<void>;
  close(): Promise<void>;
}
