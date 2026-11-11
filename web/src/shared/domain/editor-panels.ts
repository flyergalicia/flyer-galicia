// The three panels of the flyer editor. They live here, apart from the editor, because the search of
// screens offers them before the code of the editor comes down.
export type EditorPanel = "individual" | "masivo" | "historial";

export const EDITOR_PANELS: readonly (readonly [EditorPanel, string])[] = [
  ["individual", "Individual"],
  ["masivo", "Masivo"],
  ["historial", "Historial"],
];

export function isEditorPanel(value: string): value is EditorPanel {
  return EDITOR_PANELS.some(([panel]) => panel === value);
}

/** What else of the editor can be reached from outside: "Cambiar logos" and the menu "Otros". */
export const LOGO_EDITING_PLACE = "logos";
export const OTHERS_PLACE = "otros";

const OPTION_PLACE = /^option:(\d+)$/;

/** A flyer of the bar, as a place of the editor. */
export function optionPlace(option: number): string {
  return `option:${String(option)}`;
}

export function optionOfPlace(place: string): number | null {
  const match = OPTION_PLACE.exec(place);
  return match ? Number(match[1]) : null;
}
