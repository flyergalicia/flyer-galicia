// What Cambiar logos knows at any moment, and the part of the store the sections, the drafts and
// Marcas guardadas work with. It lives apart so that they do not have to know the whole store.
import type { Cut, FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { LoadedOption } from "@/shared/lib/flyer-workspace/index.ts";
import type { FlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import type { FlyerPlace, PlacedChange } from "./change.ts";
import type { FlyerCoordinates } from "./coordinates.ts";
import type { StoredDraft } from "./draft-storage.ts";
import type { GuideLine } from "./guides.ts";
import type { LogoHistory } from "./history.ts";
import type { OpenWork } from "./open-work.ts";
import type { PlacementView } from "./placement-model.ts";
import type { StripSession } from "./strip-session.ts";

/** Marking a zone of the flyer, or placing a section on it. */
export type ZoneMode = "none" | "strip" | "trim" | "insert";

export interface PickerRequest {
  readonly place: FlyerPlace;
  readonly text?: PlacedChange;
  readonly several?: readonly FlyerPlace[];
}

export interface SelectionBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A band of the flyer about to be taken out: nothing is touched until it is confirmed. */
export interface PendingTrim {
  readonly y: number;
  readonly h: number;
  readonly art: string;
}

/** What was copied from a flyer to be put in this one. */
export interface CopiedSection {
  readonly u: string;
  readonly sy: number;
  readonly sh: number;
  readonly sw: number;
  readonly nombre?: string;
}

/** The middle of a gap between two blocks, and half that gap. */
export interface InsertSpot {
  readonly y: number;
  readonly pad: number;
}

export type SavedSetsWindow = "list" | "save" | null;

export interface LogoEditorState {
  readonly on: boolean;
  /** "Vista previa": the flyer as it is downloaded, which does not react to touches. */
  readonly clean: boolean;
  readonly tipGone: boolean;
  readonly mode: ZoneMode;
  readonly list: readonly PlacedChange[];
  /** The picture that list was made on: on another one, it is not active. */
  readonly art: string;
  readonly selected: number;
  readonly group: readonly number[];
  /** Logos of the flyer chosen with Shift, that are not changes yet. */
  readonly places: readonly FlyerPlace[];
  readonly dragging: boolean;
  readonly guides: readonly GuideLine[];
  readonly flashing: ReadonlySet<number>;
  readonly history: LogoHistory;
  readonly picker: PickerRequest | null;
  /** The strip whose window is on screen. */
  readonly strip: StripSession | null;
  readonly box: SelectionBox | null;
  /** The band being dragged in Recortar, relative to the canvas. */
  readonly trimBand: { readonly y0: number; readonly y1: number } | null;
  readonly pendingTrim: PendingTrim | null;
  readonly sectionPicker: boolean;
  readonly section: CopiedSection | null;
  readonly sectionThumbnail: string;
  readonly insertLine: InsertSpot | null;
  /** A finger has no "following the mouse": the place is confirmed. */
  readonly insertConfirm: InsertSpot | null;
  /** The drafts and designs open beside the flyers. */
  readonly works: readonly OpenWork[];
  readonly activeWork: string | null;
  /** The draft with changes whose × was touched: it asks first. */
  readonly closingWork: string | null;
  /** The drafts of last time, offered back. */
  readonly recoverable: readonly StoredDraft[] | null;
  readonly savedSets: SavedSetsWindow;
  /** The window of Guardar en Estudio. */
  readonly savingDesign: boolean;
  readonly placement: PlacementView | null;
}

/** What only the screen knows: who is using it and what the catalog says. */
export interface EditorEnvironment {
  readonly workspace: FlyerWorkspace;
  readonly notify: (text: string, durationMs?: number) => void;
  /** Goes to an option, with what its tab draws. */
  readonly selectOption?: (option: number) => Promise<LoadedOption>;
  /** Who it is, to keep the drafts apart. */
  readonly personId?: () => string;
  /** The flyers this person can use. */
  readonly canUseOption?: (option: number) => boolean;
  /** The screen of Estudio, on the place where flyers are proposed. */
  readonly goToStudioSources?: () => void;
  /** An administrator looking at the app as another profile. */
  readonly isPreviewingProfile?: () => boolean;
  readonly optionLabel?: (option: number) => string;
  /** The promotions on screen in Promociones, and all of them. */
  readonly catalog?: () => {
    readonly shown: readonly Promotion[];
    readonly all: readonly Promotion[];
  };
}

export interface EditorCore {
  readonly workspace: FlyerWorkspace;
  readonly notify: EditorEnvironment["notify"];
  readonly getState: () => LogoEditorState;
  readonly set: (next: Partial<LogoEditorState>) => void;
  readonly active: () => readonly PlacedChange[];
  /** What was on another flyer does not come to this one. */
  readonly ownList: () => readonly PlacedChange[];
  readonly currentArt: () => string;
  readonly picture: () => FlyerArt | null;
  readonly cuts: () => readonly Cut[];
  readonly coordinates: () => FlyerCoordinates | null;
  readonly replaceList: (list: readonly PlacedChange[], next?: Partial<LogoEditorState>) => void;
  /** What a download carries is what the list says now. */
  readonly publish: () => void;
  /** Everything that changes the list ends here. */
  readonly settle: () => void;
  /** After a cut: it draws, and it is a step of Deshacer at once. */
  readonly settleCut: () => void;
  readonly noteStepNow: () => void;
  readonly startHistoryHere: () => void;
  readonly setOn: (on: boolean) => void;
}
