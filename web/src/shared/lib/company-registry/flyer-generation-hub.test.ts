import { describe, expect, it, vi } from "vitest";
import { createFlyerGenerationHub } from "./flyer-generation-hub.ts";
import type { FlyerGenerationPort, FlyerGenerationRequest } from "./flyer-generation-port.ts";

const REQUEST: FlyerGenerationRequest = {
  companies: [],
  format: "pdf",
  onProgress: () => undefined,
};

function works(fields: Partial<FlyerGenerationPort> = {}): FlyerGenerationPort {
  return {
    hasFlyer: () => undefined,
    isGenerating: () => false,
    generate: vi.fn<FlyerGenerationPort["generate"]>(() => Promise.resolve()),
    ...fields,
  };
}

function hubWith(waitMs = 1000) {
  const openEditor = vi.fn<() => void>();
  const onEditorNotThere = vi.fn<() => void>();
  return {
    hub: createFlyerGenerationHub({ openEditor, onEditorNotThere, waitMs }),
    openEditor,
    onEditorNotThere,
  };
}

describe("the one that answers Base de datos", () => {
  it("with no editor on the page it knows nothing, and nothing is running", () => {
    const { hub } = hubWith();
    expect(hub.hasFlyer(9)).toBeUndefined();
    expect(hub.isGenerating()).toBe(false);
    expect(hub.check()).toEqual({ done: false, failed: false });
  });

  it("the editor knows better than the check; what it does not know, the check says", () => {
    const { hub } = hubWith();
    hub.noteCheck(
      new Map([
        [9, false],
        [8, true],
      ]),
      false,
    );
    hub.attach(works({ hasFlyer: (option) => (option === 9 ? true : undefined) }));
    expect(hub.hasFlyer(9)).toBe(true);
    expect(hub.hasFlyer(8)).toBe(true);
    expect(hub.hasFlyer(7)).toBeUndefined();
  });

  it("a check that could not ask writes down only what it did find out (invariant 24)", () => {
    const { hub } = hubWith();
    hub.noteCheck(new Map([[8, false]]), true);
    expect(hub.check()).toEqual({ done: true, failed: true });
    expect(hub.hasFlyer(8)).toBe(false);
    expect(hub.hasFlyer(9)).toBeUndefined();
  });

  it("while an editor is there, it answers for it", async () => {
    const { hub, openEditor } = hubWith();
    const editor = works({ isGenerating: () => true });
    hub.attach(editor);
    expect(hub.isGenerating()).toBe(true);
    await hub.generate(REQUEST);
    expect(editor.generate).toHaveBeenCalledWith(REQUEST);
    expect(openEditor).not.toHaveBeenCalled();
  });

  it("the editor that goes away no longer answers", () => {
    const { hub } = hubWith();
    const detach = hub.attach(works({ isGenerating: () => true }));
    detach();
    expect(hub.isGenerating()).toBe(false);
  });

  it("one that goes away does not take the next one with it", () => {
    const { hub } = hubWith();
    const detachOld = hub.attach(works());
    hub.attach(works({ isGenerating: () => true }));
    detachOld();
    expect(hub.isGenerating()).toBe(true);
  });

  it("with no editor on the page, it asks for it and goes on when it arrives", async () => {
    const { hub, openEditor, onEditorNotThere } = hubWith();
    const asked = hub.generate(REQUEST);
    expect(openEditor).toHaveBeenCalledTimes(1);
    const editor = works();
    hub.attach(editor);
    await asked;
    expect(editor.generate).toHaveBeenCalledWith(REQUEST);
    expect(onEditorNotThere).not.toHaveBeenCalled();
  });

  it("an editor that never arrives is said, and nothing stays hanging", async () => {
    const { hub, onEditorNotThere } = hubWith(1);
    await hub.generate(REQUEST);
    expect(onEditorNotThere).toHaveBeenCalledTimes(1);
    const editor = works();
    hub.attach(editor);
    expect(editor.generate).not.toHaveBeenCalled();
  });
});
