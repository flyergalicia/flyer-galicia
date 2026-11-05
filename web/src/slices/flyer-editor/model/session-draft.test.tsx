import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  draftKey,
  draftSignature,
  draftValues,
  forgetDraft,
  isWorthOffering,
  readDraft,
  type SessionDraft,
  writeDraft,
} from "./session-draft.ts";

const KEY = draftKey("ana");

function draft(values: Partial<SessionDraft["v"]> = {}): SessionDraft {
  return {
    v: { empresa: "ACME", ...values },
    ac: 0,
    opt: 9,
    filename: "Flyer",
    filenameManual: false,
    ts: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the flyer half made", () => {
  it("has its key by person", () => {
    expect(KEY).toBe("fg_draft_ana");
  });

  it("the legal text travels only if it is an edit: an old one does not step on a new one", () => {
    expect(draftValues({ empresa: "A", legal: "Mio" }, "Guardado").legal).toBe("Mio");
    expect("legal" in draftValues({ empresa: "A", legal: "Guardado" }, "Guardado")).toBe(false);
    expect("legal" in draftValues({ empresa: "A", legal: "Mio" }, undefined), "no base").toBe(
      false,
    );
  });

  it("with nothing of its own there is nothing to offer", () => {
    expect(isWorthOffering(draft())).toBe(true);
    expect(isWorthOffering(draft({ empresa: "  " }))).toBe(false);
    expect(isWorthOffering(draft({ empresa: "", legal: "" })), "an edit that erased it").toBe(true);
    expect(isWorthOffering(draft({ empresa: "", nombre3: "Ana" }))).toBe(true);
    expect(isWorthOffering(draft({ empresa: "", nombre: "Sola" })), "the first is always").toBe(
      false,
    );
    expect(isWorthOffering(draft({ empresa: "", benefNombre: "B" }))).toBe(true);
    expect(isWorthOffering(draft({ empresa: "", sedesTit: "T" }))).toBe(true);
  });

  it("comes back as it went, and goes away", () => {
    writeDraft(KEY, draft());
    expect(readDraft(KEY)).toEqual(draft());
    forgetDraft(KEY);
    expect(readDraft(KEY)).toBeNull();
  });

  it("what cannot be read, or has nothing, is no draft", () => {
    localStorage.setItem(KEY, "{no es json");
    expect(readDraft(KEY)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ sin: "valores" }));
    expect(readDraft(KEY)).toBeNull();
    writeDraft(KEY, draft({ empresa: "" }));
    expect(readDraft(KEY)).toBeNull();
    localStorage.setItem(KEY, "null");
    expect(readDraft(KEY)).toBeNull();
  });

  it("a browser with no room does not stop anybody", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Closed");
    });
    expect(() => {
      writeDraft(KEY, draft());
      forgetDraft(KEY);
    }).not.toThrow();
  });

  it("the moment does not make it another one", () => {
    expect(draftSignature(draft())).toBe(draftSignature({ ...draft(), ts: 99 }));
    expect(draftSignature(draft())).not.toBe(draftSignature(draft({ empresa: "Otra" })));
  });
});
