import { type FlyerPoint } from "./logo-editor.ts";

export interface FlyerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlacementButton =
  | "restore"
  | "review"
  | "keep"
  | "placeSure"
  | "back"
  | "skip"
  | "place"
  | "finish";

/** The bar that guides the placement of a saved set of brands. */
export interface PlacementBar {
  progress: string;
  title: string;
  text: string;
  /** "Va acá" is on the flyer. */
  suggestionShown: boolean;
  /** It reads "¿Va acá?", because the place is not certain. */
  suggestionUncertain: boolean;
  /** Things already placed that are marked on the flyer. */
  markedOnFlyer: number;
  buttons: PlacementButton[];
  disabledButtons: PlacementButton[];
  /** "preview" shows it all placed; "steps" goes one thing at a time. */
  mode: "preview" | "steps" | null;
}

export interface FlyerLayout {
  changes: number;
  strip: FlyerBox | null;
  stripBrands: string[];
  /** Center of the brand asked for. */
  brand: { centerX: number; centerY: number } | null;
  texts: string[];
  emptyPlaces: number;
}

export interface SavedSetRow {
  title: string;
  content: string;
  hasImage: boolean;
  isOutdated: boolean;
}

export interface SaveSetWindow {
  /** Which one it would replace; null when it does not offer replacing any. */
  replacing: string | null;
  name: string;
  confirmLabel: string;
  province: string | null;
}

export interface PlacedMark {
  image: string;
  outOfProvince: boolean;
  note: string;
}

export interface PlacementTraces {
  placing: boolean;
  bar: boolean;
  suggestion: boolean;
  marks: boolean;
}

export interface BandMove {
  fromY: number;
  height: number;
  toY: number;
}

/** "Marcas guardadas": saving what was changed in a flyer and applying it to another. */
export interface SavedBrandsDriver {
  buttonVisible(): Promise<boolean>;

  // Preparing a flyer to save
  /** Builds a strip of logos in that box, with the first brands available; returns them. */
  buildStrip(box: FlyerBox, brands: number): Promise<string[]>;
  /** Puts that supermarket on the logo at that point, with its days of discount. */
  putSupermarket(at: FlyerPoint, name: string): Promise<void>;
  /** Leaves empty the logo at that point. */
  emptyPlace(at: FlyerPoint): Promise<void>;
  /** The changes are done: nothing stays selected. */
  finishChanges(): Promise<void>;
  layout(brand: RegExp): Promise<FlyerLayout>;
  /** The catalog of this page says that brand only has a promotion in that province. */
  brandOnlyInProvince(image: string, province: string): Promise<void>;
  /** The catalog of this page says that brand expired two days ago. */
  brandExpired(image: string): Promise<void>;

  // Saving
  /** Opens Marcas guardadas and presses "Guardar las de este flyer". */
  openSaveWindow(): Promise<void>;
  /** Presses save with the window of Marcas guardadas closed. */
  openSaveWindowDirectly(): Promise<void>;
  saveWindow(): Promise<SaveSetWindow>;
  /** Picks the first province other than that one and returns it. */
  pickProvinceOtherThan(province: string): Promise<string>;
  /** Writes the name, saves and waits for the list to show it. */
  saveAs(name: string): Promise<void>;
  /** Presses the button of the window as it is. */
  confirmSaveWindow(): Promise<void>;
  /** Opens Marcas guardadas with the list read again. */
  readList(): Promise<SavedSetRow[]>;
  closeList(): Promise<void>;

  // Applying
  /** Applies that set and waits for the placement bar. */
  apply(id: string): Promise<PlacementBar>;
  bar(): Promise<PlacementBar>;
  press(button: PlacementButton): Promise<void>;
  /** Touches the dot of that step. */
  touchStep(step: number): Promise<void>;
  /** Marks a box on the flyer; with no size it is one touch on that point. */
  placeAt(box: FlyerBox): Promise<void>;
  pressKey(key: string): Promise<void>;
  /** Presses Enter until the placement ends, as far as a few steps. */
  acceptAll(): Promise<void>;
  traces(): Promise<PlacementTraces>;
  marks(): Promise<PlacedMark[]>;
  expiredMarks(): Promise<number>;
  /** Takes all the changes out of the flyer and waits for the app to notice. */
  clearFlyer(): Promise<void>;
  /** Presses Deshacer once, a while after the last change. */
  undoOnce(): Promise<void>;
  /** Presses Listo in the logo editor. */
  leaveEditor(): Promise<void>;
  /** Comes back to the logo editor and takes all the changes out of the flyer. */
  reenterEditorClean(): Promise<void>;

  // The new model of the flyer
  /** The flyer is replaced by another one with those bands in other places. */
  useArtworkWithMovedBands(moves: BandMove[]): Promise<void>;
  /** The flyer is replaced by another one with that band blank. */
  useArtworkWithBlankBand(y: number, height: number): Promise<void>;
  /** The flyer changes while a placement is under way. */
  changeArtworkDuringPlacement(): Promise<void>;
  /** The flyer that was on screen first comes back. */
  restoreArtwork(): Promise<void>;
}
