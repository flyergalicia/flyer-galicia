export interface FlyerRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlyerOptionStatus {
  /** The outcome is known for good; false means the app will try to load it again. */
  settled: boolean;
  /** False is a firm "this option has no flyer"; null means it is not known yet. */
  hasArtwork: boolean | null;
  /** It is on screen, finished loading and its artwork is what gets drawn. */
  ready: boolean;
}

export interface FlyerEditorDriver {
  selectOption(option: number): Promise<void>;
  /** Forgets all that was loaded for the option and selects it, so it is requested again. */
  reloadOption(option: number): Promise<void>;
  waitForOptionShown(option: number): Promise<void>;
  /** Waits for the notice that takes the place of a flyer that could not load, and reads it. */
  waitForLoadProblem(): Promise<string>;
  waitForNoLoadProblem(): Promise<void>;
  hasLoadProblem(): Promise<boolean>;
  /** Presses Reintentar on that notice. */
  retryLoading(): Promise<void>;
  optionStatus(option: number): Promise<FlyerOptionStatus>;
  /** The artwork being drawn is the one that option loaded. */
  showsArtworkOf(option: number): Promise<boolean>;
  /** The calibration in use, as data. */
  activeCalibration(): Promise<Record<string, unknown>>;
  optionCalibration(option: number): Promise<Record<string, unknown>>;
  /** Why a download is refused, in the words the user reads; empty when it is allowed. */
  downloadBlockReason(): Promise<string>;
  /** The preview is switched off because there is no flyer to trust. */
  previewIsOff(): Promise<boolean>;
  setZoom(zoom: number): Promise<void>;
  /** Presses Restaurar. */
  restoreDefaults(): Promise<void>;
  /** Fingerprint of a region of the image a download would contain, in flyer pixels. */
  downloadRegionDigest(region: FlyerRegion): Promise<string>;
}
