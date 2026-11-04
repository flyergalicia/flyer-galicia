import { type FlyerRegion } from "./flyer-editor.ts";
import { type FlyerPoint } from "./logo-editor.ts";

/** What the app reads from the logos printed inside a region of the flyer. */
export interface StripDetection {
  /** How many logos it found. */
  logos: number;
  /** Logos found on each row, from top to bottom. */
  rows: number[];
  /** Logos on the widest row. */
  perRow: number;
}

/** A brand in "Tu selección", in its order. */
export interface StripBrand {
  logo: string;
  title: string;
  /** Size relative to the place it was given: 1 is untouched. */
  size: number;
  /** How far it was moved by hand from its place, in flyer pixels. */
  moved: FlyerPoint;
  /** It was added by "Sugerir marcas". */
  suggested: boolean;
}

/** A row of "Tu selección" as it is on screen. */
export interface StripSelectionRow {
  number: number;
  title: string;
  hasThumbnail: boolean;
  highlighted: boolean;
  suggestedMark: boolean;
}

export interface StripWindowState {
  /** It was opened on a strip already built, not on a new one. */
  resuming: boolean;
  brands: StripBrand[];
  /** Value of "Por fila"; 0 means automatic. */
  perRow: number;
  /** "Tamaño de todos", where 1 is 100%. */
  sizeOfAll: number;
  /** Index of the logo marked in the preview; -1 when none is. */
  marked: number;
  /** The region the strip will fill, once adjusted to not step on other strips. */
  region: FlyerRegion;
  /** Logos the app counted in the original strip. */
  originalLogos: number;
}

export interface PreviewPlacement {
  /** Where each brand is drawn, in flyer pixels, in the order of the selection. */
  boxes: (FlyerRegion | null)[];
}

export interface BrandFilters {
  province: string;
  locality: string;
  category: string;
  /** "Juntar sucursales de la misma marca". */
  joinBranches: boolean;
  /** "Sin las de compra online", as the window remembers it. */
  hideOnline: boolean;
  /** The same filter as its checkbox shows it. */
  hideOnlineTicked: boolean;
}

/** A brand the filters of the window let through, with no limit on how many. */
export interface MatchingBrand {
  id: number | string;
  logo: string;
  title: string;
  isOnline: boolean;
}

/** What the catalog knows about a brand of the selection. */
export interface SelectedBrandFacts {
  logo: string;
  suggested: boolean;
  category: string;
  /** The same key for every branch of a brand. */
  brandKey: string;
  promotionId: number | string;
  /** There is a promotion with this logo in the province that is not an online one. */
  hasLocalPromotion: boolean;
  /** There is a promotion with this logo in the province, or an online one. */
  hasPromotionThereOrOnline: boolean;
}

export interface StripChange {
  /** The strip it belongs to; null for a loose logo. */
  strip: string | null;
  /** It is the patch that covers the original logos of a strip, not a logo. */
  isCover: boolean;
  kind: "brand" | "text" | "empty";
  /** It is a logo printed on the flyer that was moved from its place. */
  isMovedOriginal: boolean;
  logo: string;
  title: string;
  /** Text it writes, for days under a supermarket. */
  text: string | null;
  fontSize: number | null;
  /** Where it is drawn, in flyer pixels; null when it draws nothing of its own. */
  box: FlyerRegion | null;
  /** The place it started from, in flyer pixels. */
  origin: FlyerRegion | null;
}

/** The "+" of a row of Promociones while choosing brands. */
export interface ChooserRow {
  brand: string;
  status: string;
  /** "absent" means that row offers no "+" at all. */
  add: "enabled" | "disabled" | "absent";
  /** Order number it shows when already chosen; 0 otherwise. */
  chosenAs: number;
  /** Why it is disabled, in the words the user reads. */
  reason: string;
}

export interface WindowLayout {
  viewport: { width: number; height: number };
  /** Top and height of each block on screen, in screen pixels. */
  dialog: { top: number; height: number };
  preview: { top: number; height: number };
  brandList: { top: number; height: number };
  selection: { top: number; height: number };
  actions: { top: number; height: number };
}

/** Which parts of the window can be seen right now. */
export interface WindowParts {
  stepTabs: boolean;
  brandList: boolean;
  preview: boolean;
  selection: boolean;
  next: boolean;
  put: boolean;
  back: boolean;
  cancel: boolean;
}

export interface FlyerMark {
  expired: boolean;
  /** The label that shows on the mark. */
  label: string;
  borderColor: string;
}

export interface BrandValidityChange {
  logo: string;
  /** Every promotion of that logo now ends this many days from today. */
  expiresInDays: number;
  /** Adds another promotion of that logo that starts later and ends in these days. */
  upcomingEndingInDays?: number;
}

export interface LogoStripDriver {
  // On the flyer, while editing logos.
  /** Reads the logos printed inside a region. */
  detectLogos(region: FlyerRegion): Promise<StripDetection>;
  /** Reads the place of the logo printed at that point. */
  detectLogoPlace(at: FlyerPoint): Promise<FlyerRegion>;
  /** Waits until the promotions catalog is in memory. */
  waitForCatalog(): Promise<void>;
  /** "Armar franja" can be seen on the bar. */
  markButtonVisible(): Promise<boolean>;
  /** Presses "Armar franja" on the bar. */
  startMarking(): Promise<void>;
  isMarking(): Promise<boolean>;
  /** The instruction on the bar, in the words the user reads. */
  editingHelp(): Promise<string>;
  /** A plain click on the flyer. */
  clickFlyer(at: FlyerPoint): Promise<void>;
  doubleClickFlyer(at: FlyerPoint): Promise<void>;
  /** Shift + click on the flyer. */
  shiftClickFlyer(at: FlyerPoint): Promise<void>;
  /** Presses the mouse at a point and moves it there and to the offset, in screen pixels. */
  dragOnFlyer(from: FlyerPoint, by: { x: number; y: number }): Promise<void>;
  /** Drags a box around that region with the mouse, while marking. */
  markRegionByDragging(region: FlyerRegion): Promise<void>;
  changes(): Promise<StripChange[]>;
  /** Takes every logo change out, as if nothing had been touched. */
  removeAllChanges(): Promise<void>;
  /** Puts different brands valid today on those regions, one each; returns their logos. */
  placeBrandsOn(regions: readonly FlyerRegion[]): Promise<string[]>;
  /** Puts a brand on a far away place and then moves it, as a loose logo with that title. */
  placeLooseLogoMovedTo(region: FlyerRegion, title: string, movedTo: FlyerPoint): Promise<void>;
  /** Deletes the first logo of a strip, the way Supr does. */
  deleteFirstLogoOfStrip(strip: string): Promise<void>;
  /** Takes the first logo of a strip out of it with another brand; returns the old logo. */
  replaceFirstLogoOfStrip(strip: string): Promise<string>;
  /** Leaves no logo chosen on the flyer. */
  releaseLogos(): Promise<void>;
  /** The bar for adjusting the chosen logo can be seen. */
  logoToolbarVisible(): Promise<boolean>;
  /** That bar offers "Editar franja". */
  toolbarOffersEditStrip(): Promise<boolean>;
  /** Presses "Editar franja" on that bar. */
  pressEditStripOnToolbar(): Promise<void>;
  /** How many "Editar franja" buttons are over the flyer. */
  editStripButtons(): Promise<number>;
  /** Presses the first of them. */
  pressEditStripOnFlyer(): Promise<void>;
  /** The marks the edit mode draws over the changed logos. */
  flyerMarks(): Promise<FlyerMark[]>;
  /** Changes what the catalog says about those brands, in this browser only. */
  changeBrandValidity(changes: readonly BrandValidityChange[]): Promise<void>;
  /** The last notice on screen. */
  lastNotice(): Promise<string>;
  /** Presses "Vista previa" or "Seguir editando" on the bar of Cambiar logos. */
  setCleanView(on: boolean): Promise<void>;
  /** The layer with the marks over the flyer can be seen. */
  marksLayerVisible(): Promise<boolean>;
  /** Sets the filters of Promociones → Activas that the windows start from. */
  setActivePromotionsFilters(filters: { hideOnline: boolean; category: string }): Promise<void>;
  /** "Ocultar online" of Promociones → Activas is on. */
  activePromotionsHideOnline(): Promise<boolean>;

  // The Armar franja window.
  /**
   * Marks that region and waits for the window. `province` is the one the windows remember
   * from the last time and `daysBelow` the "poner sus días" tick they remember.
   */
  open(region: FlyerRegion, remembered?: { province?: string; daysBelow?: boolean }): Promise<void>;
  /** Waits for the window to appear after something other than `open`. */
  waitForWindow(): Promise<void>;
  isOpen(): Promise<boolean>;
  state(): Promise<StripWindowState>;
  /** The explanation at the top of the window. */
  intro(): Promise<string>;
  /** The label of the button that puts the logos. */
  putLabel(): Promise<string>;
  /** Types in the search box and waits for the list to filter. */
  search(text: string): Promise<void>;
  /** Searches and ticks the first brand not ticked yet. */
  tickBySearch(text: string): Promise<void>;
  /** Ticks the first brands of the list not ticked yet. */
  tickNext(count: number): Promise<void>;
  /** Like tickNext, skipping those logos; returns the logos of the selection. */
  tickNextAvoiding(count: number, avoid: readonly string[]): Promise<string[]>;
  /** Selects, from the catalog, the brands of a category named exactly so. */
  chooseExactBrands(names: readonly string[], category: string): Promise<void>;
  /** The line that says how many brands there are. */
  listInfo(): Promise<string>;
  /** All the text of the column with the filters and the brands. */
  brandsColumnText(): Promise<string>;
  filters(): Promise<BrandFilters>;
  localityFilterVisible(): Promise<boolean>;
  setProvince(province: string): Promise<void>;
  /** Chooses a locality and returns: asking Galicia for its promotions may still be going on. */
  setLocality(locality: string): Promise<void>;
  /** Waits until the brands of the chosen locality arrived. */
  waitForLocalityBrands(): Promise<void>;
  setCategory(category: string): Promise<void>;
  setJoinBranches(on: boolean): Promise<void>;
  setHideOnline(on: boolean): Promise<void>;
  matchingBrands(): Promise<MatchingBrand[]>;
  /** The category with most promotions in a province. */
  topCategoryIn(province: string): Promise<string>;
  selectedBrandFacts(province: string): Promise<SelectedBrandFacts[]>;
  /** The "poner sus días" tick of the window; null when the window does not offer it. */
  daysBelowTicked(): Promise<boolean | null>;
  /** "Elegir en pantalla completa" can be seen. */
  offersFullScreen(): Promise<boolean>;
  pressSuggest(): Promise<void>;
  /** Waits until "Sugerir marcas" added some brand. */
  waitForSuggestions(): Promise<void>;
  /** "Quitar sugeridas" can be seen. */
  offersRemoveSuggested(): Promise<boolean>;
  pressRemoveSuggested(): Promise<void>;
  selectionRows(): Promise<StripSelectionRow[]>;
  moveBrandUp(index: number): Promise<void>;
  moveBrandDown(index: number): Promise<void>;
  removeBrand(index: number): Promise<void>;
  /** Clicks a row of the selection, which marks its logo in the preview. */
  clickBrandRow(index: number): Promise<void>;
  /** Drags a row to the place of another one, with the mouse. */
  dragBrandRow(from: number, to: number): Promise<void>;
  /** Drags a row by its handle, with a finger, to just below another one. */
  dragBrandRowWithFinger(from: number, belowRow: number): Promise<void>;
  setPerRow(perRow: number): Promise<void>;
  /** Presses the button that puts the logos, without waiting for anything. */
  pressPut(): Promise<void>;
  /** Presses it twice at the same instant. */
  pressPutTwiceAtOnce(): Promise<void>;
  /** Presses it and waits for the window to close. */
  put(): Promise<void>;
  waitForWindowClosed(): Promise<void>;
  /** Presses Cancelar. */
  cancel(): Promise<void>;
  /** Presses the X. */
  close(): Promise<void>;
  offersRestoreOriginal(): Promise<boolean>;
  /** Presses "Volver la franja al original". */
  restoreOriginal(): Promise<void>;

  // The preview of the window.
  /** Waits until every chosen logo is downloaded and drawn. */
  waitForPreviewLogos(): Promise<void>;
  previewSize(): Promise<{ width: number; height: number }>;
  previewPlacement(): Promise<PreviewPlacement>;
  /** Screen pixels per flyer pixel in the preview. */
  previewScale(): Promise<number>;
  clickPreviewLogo(index: number): Promise<void>;
  /** Presses on a logo of the preview and drags it through those offsets, in screen pixels. */
  dragPreviewLogo(index: number, offsets: readonly { x: number; y: number }[]): Promise<void>;
  clickPreviewCorner(): Promise<void>;
  /** The controls under the preview, as text. */
  adjustmentsText(): Promise<string>;
  /** The size control of the marked logo can be seen. */
  markedSizeVisible(): Promise<boolean>;
  /** Presses "+" for the marked logo. */
  pressMarkedBigger(): Promise<void>;
  /** Sets the size of the marked logo, in percent. */
  setMarkedSize(percent: number): Promise<void>;
  /** Sets "Tamaño de todos", in percent. */
  setSizeOfAll(percent: number): Promise<void>;
  /** Presses "Volver a su lugar". */
  pressBackToPlace(): Promise<void>;
  /** "Ampliar vista previa" can be seen. */
  offersLargePreview(): Promise<boolean>;
  pressLargePreview(): Promise<void>;
  largePreviewLabel(): Promise<string>;
  /** Scrolls the brand list and the selection. */
  scrollLists(): Promise<void>;
  /** Scrolls the whole window. */
  scrollWindow(top: number): Promise<void>;
  /** Top of the preview relative to the window, and its height. */
  previewInWindow(): Promise<{ top: number; height: number }>;
  /** The page does not scroll sideways. */
  pageFitsWidth(): Promise<boolean>;
  /** The window itself does not scroll sideways. */
  windowFitsWidth(): Promise<boolean>;
  layout(): Promise<WindowLayout>;
  undoRedoEnabled(): Promise<{ undo: boolean; redo: boolean }>;
  pressUndo(): Promise<void>;
  /** Waits until the last change was written down as a step that can be undone. */
  waitForHistoryStep(): Promise<void>;
  /** Takes the focus out of any field, so that the keyboard belongs to the window. */
  blurFocus(): Promise<void>;
  /** Puts the focus on the search box. */
  focusSearch(): Promise<void>;

  // The two steps of the window on a phone.
  visibleParts(): Promise<WindowParts>;
  nextStepLabel(): Promise<string>;
  pressNextStep(): Promise<void>;
  /** Presses "← Elegir más". */
  pressBackToBrands(): Promise<void>;
  /** Presses the tab of a step. */
  pressStep(step: 1 | 2): Promise<void>;
  stepLabel(step: 1 | 2): Promise<string>;

  // Choosing on Promociones at full screen, from the window of the strip or of one logo.
  /** Presses "Elegir en pantalla completa" on the Armar franja window. */
  chooseAtFullScreen(): Promise<void>;
  /** Waits until the promotions table offers its "+". */
  waitForChooserRows(): Promise<void>;
  /** The bar of the chooser is on screen. */
  chooserBarVisible(): Promise<boolean>;
  chooserBarText(): Promise<string>;
  /** The Promociones screen can be seen. */
  promotionsVisible(): Promise<boolean>;
  /** The province and the "one per brand" filter that Promociones shows. */
  chooserFilters(): Promise<{ province: string; oneBrand: boolean }>;
  /** Choosing is still going on. */
  isChoosing(): Promise<boolean>;
  /** Titles chosen so far, in order. */
  chosenTitles(): Promise<string[]>;
  /** How many "+" the table shows. */
  chooserAddButtons(): Promise<number>;
  /** Numbers of the rows that are already chosen. */
  chooserChosenNumbers(): Promise<string[]>;
  /** Presses the n-th "+" among the ones that are on and not chosen yet. */
  chooserAdd(nth: number): Promise<void>;
  /** Presses the n-th "+", chosen or not, among the ones that are on. */
  chooserPress(nth: number): Promise<void>;
  /** Presses the n-th "+" that is already chosen. */
  chooserRemove(nth: number): Promise<void>;
  /** Presses "Volver a la franja" or "Volver al logo". */
  chooserBack(): Promise<void>;
  /** Presses Cancelar on that bar. */
  chooserCancel(): Promise<void>;
  /** Goes to the Buscar tab of Promociones. */
  chooserGoToSearch(): Promise<void>;
  /** Pastes brands on Buscar, presses Validar and waits for the rows. */
  validateBrands(lines: readonly string[]): Promise<void>;
  chooserRows(): Promise<ChooserRow[]>;
  /** Clicks a "+" that is off as if it were on; false if there is none. */
  forcePressDisabledAdd(): Promise<boolean>;
  /** Picks the first brand on offer whose logo downloads, on one logo; returns the logo. */
  chooseFirstForOneLogo(): Promise<string>;
  /** Opens the Promociones screen. */
  openPromotions(): Promise<void>;
  /** Boxes to exclude a row from the report, on the table of Buscar. */
  excludeBoxes(): Promise<number>;

  // The window for a single logo, which shares the filters of the brands.
  /** Opens it for the logo printed at that point. */
  openPickerAt(at: FlyerPoint): Promise<void>;
  /** Opens it for a region marked by hand. */
  openPickerOn(region: FlyerRegion, remembered?: { province: string }): Promise<void>;
  /** Waits for it to open after something other than those two. */
  waitForPicker(): Promise<void>;
  isPickerOpen(): Promise<boolean>;
  pickerTitle(): Promise<string>;
  pickerFilters(): Promise<BrandFilters>;
  /** The categories of the brands it lists, one per brand. */
  pickerListedCategories(): Promise<string[]>;
  /** The filters can be seen. */
  pickerShowsFilters(): Promise<boolean>;
  /** The "poner también sus días" tick is offered. */
  pickerOffersDays(): Promise<boolean>;
  /** Presses "Escribir un texto". */
  pickerWriteText(): Promise<void>;
  pickerSetHideOnline(on: boolean): Promise<void>;
  /** Presses "Elegir en pantalla completa". */
  pickerChooseAtFullScreen(): Promise<void>;
  closePicker(): Promise<void>;

  /** Shift + click on a logo of the preview, which adds it to or takes it from those chosen. */
  shiftClickPreviewLogo(index: number): Promise<void>;
  /** The logos chosen in the preview, in the order of the selection. */
  chosenInPreview(): Promise<number[]>;
}
