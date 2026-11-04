/** A position in flyer pixels: the same whatever the zoom or the screen. */
export interface FlyerPoint {
  x: number;
  y: number;
}

export interface FlyerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A position on the screen, in screen pixels, as the mouse takes it. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LogoChange {
  kind: "brand" | "text" | "empty";
  title: string;
  /** Where the new logo is drawn, in rounded flyer pixels; null when nothing is drawn. */
  box: { x: number; y: number; width: number; height: number } | null;
}

/** A change on the flyer as exact as the editor keeps it. */
export interface PlacedLogo {
  kind: LogoChange["kind"];
  title: string;
  /** What identifies its image: a brand, an upload or a piece of the flyer. Empty if none. */
  image: string;
  /** Where it is drawn, in flyer pixels; null when nothing is drawn. */
  box: FlyerBox | null;
  /** The place it was given when it was put, in flyer pixels. */
  place: FlyerBox | null;
  /** What is printed on the flyer under it does not show. */
  coversFlyer: boolean;
  isCopy: boolean;
  /** Its size compared to the one it got when it was put. */
  sizePercent: number | null;
  /** Only for texts. */
  text: string | null;
  fontSize: number | null;
  color: string | null;
  weight: number | null;
}

export interface LogoSelection {
  /** The last one touched, the reference to align with; -1 when there is none. */
  main: number;
  /** Changes chosen together. */
  chosen: number[];
  /** Logos of the flyer chosen with Shift that were not changed yet. */
  flyerLogos: number;
}

/** A box the editor draws over a change or over a chosen logo of the flyer. */
export interface LogoMarker {
  visibility: "hidden" | "faint" | "full";
  line: string;
  inGroup: boolean;
  flashing: boolean;
  onFlyerLogo: boolean;
}

export interface AlignmentGuide {
  axis: "horizontal" | "vertical";
  /** Keyboard guides: the logo is close to that line but not on it yet. */
  isNear: boolean;
  /** Keyboard guides: the logo is exactly on that line. */
  isExact: boolean;
}

export interface LogoEditorModes {
  /** "Vista previa": the flyer as it is downloaded, which does not react to touches. */
  cleanPreview: boolean;
  trimming: boolean;
  markingStrip: boolean;
  /** The boxes over the flyer can be seen. */
  marksVisible: boolean;
}

/** The small image at the top of the window for changing a logo. */
export interface PickerThumbnail {
  width: number;
  height: number;
  hidden: boolean;
  /** How much is drawn on it: 0 means it is blank. */
  ink: number;
}

export interface TextFormState {
  text: string;
  /** The value of the size control, in pixels. */
  size: number;
  colors: string[];
  chosenColor: string;
}

export interface OpenDesignTab {
  name: string;
  active: boolean;
}

/** Instructions to draw a logo file from nothing, to test what is done with it. */
export interface LogoDrawing {
  width: number;
  height: number;
  format: "png" | "jpeg";
  /** Painted in order, over a transparent canvas. */
  rectangles?: readonly (FlyerBox & { color: string })[];
  /** Draws "Toledo" over the rectangles. */
  word?: { fill: string; outline?: string };
}

/** Pixels of a logo after the app cleaned it, by what they look like. */
export interface LogoPixels {
  width: number;
  height: number;
  /** Alpha of 128 or more. */
  visible: number;
  /** Visible and light in every channel. */
  visibleLight: number;
  /** Visible, dark red and more blue than red. */
  visibleBlue: number;
  /** Alpha above 200 and white in every channel. */
  solidWhite: number;
  /** Alpha above 200 and bright red channel. */
  solidBright: number;
  /** Alpha above 200, with little red and some blue. */
  solidBlue: number;
  /** Neither transparent nor opaque: a soft edge. */
  partlyTransparent: number;
  fullyTransparent: number;
  cornerAlpha: number;
}

export interface LogoEditorDriver {
  /** Presses Cambiar logos, which says Listo while editing. */
  enter(): Promise<void>;
  /**
   * Touches the logo at that point, searches for a brand and takes the first match.
   * Returns every match the search listed.
   */
  replaceWithBrand(at: FlyerPoint, search: string): Promise<{ matches: string[] }>;
  /** Touches the logo at that point and chooses "Dejar el lugar vacío". */
  leaveEmpty(at: FlyerPoint): Promise<void>;
  changes(): Promise<LogoChange[]>;
  /** How many logo changes a download would carry. */
  changesInDownload(): Promise<number>;

  // Waiting for the app.
  waitForBrandCatalog(): Promise<void>;
  /** Waits until the last change was drawn and written down as a step that can be undone. */
  waitUntilSettled(): Promise<void>;
  /** Waits until no box over the flyer is flashing. */
  waitForMarkersToStopFlashing(): Promise<void>;

  // Touching the flyer, with the point brought to the middle of the preview first.
  /** Brings that point to the middle of the preview. */
  bringIntoView(at: FlyerPoint): Promise<void>;
  /** A click on the flyer. */
  touch(at: FlyerPoint): Promise<void>;
  /** Shift + click on the flyer. */
  shiftTouch(at: FlyerPoint): Promise<void>;
  /** Drags a box with the mouse, from free flyer to free flyer. */
  drawBox(box: FlyerBox): Promise<void>;
  /** Where a point of the flyer is on the screen right now, and the pixels of screen per pixel. */
  screenPoint(at: FlyerPoint): Promise<ScreenPoint & { scale: number }>;
  /** Clicks a change, on its middle. */
  touchPlaced(index: number, options?: { withShift?: boolean }): Promise<void>;
  doubleClickPlaced(index: number): Promise<void>;
  /** Where the middle of a change is on the screen right now. */
  placedOnScreen(index: number): Promise<ScreenPoint>;

  // Putting things on the flyer without going through the window.
  /** Puts different brands valid today on those places, one each, leaving none chosen. */
  placeBrands(boxes: readonly FlyerBox[], options?: { keepLastChosen?: boolean }): Promise<void>;
  /** Marks a place as left empty. */
  placeEmpty(box: FlyerBox): Promise<void>;
  /** Puts a text on a place. */
  placeText(
    box: FlyerBox,
    text: { text: string; color: string; weight: number; fontSize: number },
  ): Promise<void>;
  /** The editor behaves as if that design of Estudio had been opened. */
  treatAsOpenDesign(name: string): Promise<void>;

  // Reading the editor.
  placements(): Promise<PlacedLogo[]>;
  selection(): Promise<LogoSelection>;
  markers(): Promise<LogoMarker[]>;
  guides(): Promise<AlignmentGuide[]>;
  modes(): Promise<LogoEditorModes>;
  /** The size of the image a change draws, before fitting it on the flyer. */
  placedImageSize(index: number): Promise<{ width: number; height: number }>;
  /** The undo steps written down so far, starting at the flyer as it comes. */
  undoSteps(): Promise<string[]>;
  /** Everything a download would carry about logos, to compare it later. */
  downloadSnapshot(): Promise<string>;
  /** Name of the design being edited; null when there is none. */
  openDesignName(): Promise<string | null>;
  /** Tabs of the drafts and designs open beside the flyers. */
  openDesignTabs(): Promise<OpenDesignTab[]>;
  /** Presses the tab of a flyer on the bar of flyers. */
  pressFlyerTab(name: string): Promise<void>;
  draftCount(): Promise<number>;
  /** A drag in progress is holding the logos. */
  isDragging(): Promise<boolean>;
  /** Places the logos of the flyer inside a region, as the editor detects them. */
  flyerLogosIn(region: FlyerBox): Promise<FlyerBox[]>;
  /** The place of the logo printed at that point, as the editor detects it. */
  flyerLogoAt(at: FlyerPoint): Promise<FlyerBox>;
  /** The preview on the screen. */
  previewOnScreen(): Promise<{ top: number; bottom: number }>;
  scrollPreviewBy(pixels: number): Promise<void>;
  /** A finger starts dragging a change and the browser cancels the gesture. */
  cancelDragOnPlaced(index: number): Promise<void>;

  // The keyboard.
  /** Takes the focus out of any field, so that the keys go to the editor. */
  leaveFields(): Promise<void>;
  focusCompanyField(): Promise<void>;
  companyFieldValue(): Promise<string>;
  clearCompanyField(): Promise<void>;

  // The window for changing a logo.
  /** Waits for the window with its list of brands. */
  waitForBrandList(): Promise<void>;
  /** Waits for the window, whatever it shows. */
  waitForPicker(): Promise<void>;
  /** After a touch, the window has not appeared a moment later. */
  pickerStaysClosed(): Promise<boolean>;
  waitForPickerClosed(): Promise<void>;
  brandListVisible(): Promise<boolean>;
  /** Types in its search box, waits for the list to filter and returns the matches. */
  searchBrands(text: string): Promise<string[]>;
  /** Clicks the first brand of the list and waits for the window to close. */
  pickFirstBrand(): Promise<void>;
  /** Clicks the first brands of the list in order, for "Reemplazar varios". */
  pickBrandsInOrder(count: number): Promise<{ images: string[]; numbers: string[] }>;
  /** Chooses a file with "Subir logo de la PC". */
  chooseLogoFile(file: string | { name: string; mimeType: string; buffer: Buffer }): Promise<void>;
  thumbnail(): Promise<PickerThumbnail>;
  /** Index of the change the window would replace; -1 when it would add one. */
  pickerTargetIndex(): Promise<number>;
  textForm(): Promise<TextFormState>;
  /**
   * Presses Cambiar for the chosen logo right after its image left the memory, and reads the
   * thumbnail in that very moment, before the image comes back.
   */
  thumbnailWithPlacedLogoOutOfMemory(index: number): Promise<PickerThumbnail>;

  // Logos as files.
  /** The app reads that drawing as an uploaded file: the logo it keeps and what it warned. */
  readUploadedLogo(drawing: LogoDrawing): Promise<{ pixels: LogoPixels; warnings: string[] }>;
  /** The app cleans an image the way it does with the logos of the catalog. */
  cleanLogo(image: Buffer | LogoDrawing): Promise<LogoPixels>;

  // Late answers.
  /** Opens the window of brands for a free area, with no logo downloaded yet. */
  openPickerForArea(box: FlyerBox): Promise<void>;
  /** Presses the first brand of the window and returns right away, while its logo downloads. */
  pressFirstBrand(): Promise<void>;
  /** Puts on a place a brand with that logo file. */
  placeBrandInArea(box: FlyerBox, brand: { image: string; title: string }): Promise<void>;

  // Used by Estudio and by cropped flyers.
  /** Touches the logo at that point and writes that text in its place. */
  writeText(at: FlyerPoint, text: string): Promise<void>;
  /** Touches the logo at that point and takes a file for it with "Subir logo de la PC". */
  uploadLogo(
    at: FlyerPoint,
    file: string | { name: string; mimeType: string; buffer: Buffer },
  ): Promise<void>;
  isEditing(): Promise<boolean>;
  /** Removes every change from the flyer, at once. */
  removeAllChanges(): Promise<void>;
  /** Changes the size of the first change to that percentage. */
  resizeFirstChange(percent: number): Promise<void>;
  /** Moves the first change sideways without selecting it. */
  shiftFirstChange(pixels: number): Promise<void>;
  /** Selects the first change, moves it sideways and writes it down as a step of Deshacer. */
  moveFirstChangeAsStep(pixels: number): Promise<void>;
  /** Writes down now the step of Deshacer that would be written a moment later. */
  writeUndoStep(): Promise<void>;
}
