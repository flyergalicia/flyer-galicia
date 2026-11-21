import { describe, expect, it } from "vitest";
import { EDITOR_PANELS, isEditorPanel, optionOfPlace, optionPlace } from "./editor-panels.ts";

describe("the places of the flyer editor", () => {
  it("are Individual, Masivo and Historial", () => {
    expect(EDITOR_PANELS.map(([, label]) => label)).toEqual(["Individual", "Masivo", "Historial"]);
    expect([isEditorPanel("masivo"), isEditorPanel("logos")]).toEqual([true, false]);
  });

  it("are also each flyer of the bar", () => {
    expect(optionOfPlace(optionPlace(12))).toBe(12);
    expect([optionOfPlace("masivo"), optionOfPlace("option:x")]).toEqual([null, null]);
  });
});
