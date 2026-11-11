import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacedChange } from "./change.ts";
import {
  BAND_PROBLEM_TEXT,
  bandProblem,
  cutsSign,
  listAfterInsert,
  listAfterTrim,
  listOnWholeFlyer,
} from "./cuts.ts";
import {
  draftsKey,
  DRAFTS_MAX_SIZE,
  forgetStoredDrafts,
  readStoredDrafts,
  type StoredDraft,
  writeStoredDrafts,
} from "./draft-storage.ts";
import { cutsIn, listIn, noteStep, photoOf, startHistory } from "./history.ts";
import { blankDraft, freeDraftName } from "./open-work.ts";
import { recentSections, rememberSection } from "./section-recents.ts";
import { missingUploads, missingUploadsText } from "./uploads.ts";

function change(y: number, h = 20, extra: Partial<PlacedChange> = {}): PlacedChange {
  return { x: 0, y, w: 50, h, bg: "", img: "a.png", t: "A", ox: 0, oy: y, ow: 50, oh: h, ...extra };
}

function drawn(y: number): PlacedChange {
  return change(y, 20, { tx: 0, ty: y, tw: 50, th: 20 });
}

function fakeStorage(setItem?: (key: string, value: string) => void) {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem:
      setItem ??
      ((key: string, value: string) => {
        store.set(key, value);
      }),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

const DRAFT: StoredDraft = {
  id: "d",
  opcion: 9,
  nombre: "Borrador 1",
  cambios: [],
  recortes: [],
  legal: null,
  subidos: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a cut on the changes of the logos", () => {
  it("takes out what falls inside and brings up what is below", () => {
    const { list, lost } = listAfterTrim([drawn(10), drawn(100), drawn(300)], 90, 100);
    expect(lost).toBe(1);
    expect(list.map(({ ty }) => ty)).toEqual([10, 200]);
    expect(list[1]?.oy).toBe(200);
    expect(list[1]?.y).toBe(200);
  });

  it("goes by what it covers when it draws nothing", () => {
    const { list } = listAfterTrim([change(300, 20, { img: "" })], 90, 100);
    expect(list[0]?.y).toBe(200);
    expect(list[0]?.ty).toBeUndefined();
    expect(listAfterTrim([change(100, 20, { ty: Number.NaN })], 90, 100).lost).toBe(1);
  });

  it("takes down what is below an inserted section", () => {
    const list = listAfterInsert([drawn(10), drawn(300)], 100, 50);
    expect(list.map(({ ty }) => ty)).toEqual([10, 350]);
  });

  it("goes back to the whole flyer: inside a section it goes away, and the rest to its place", () => {
    const list = listOnWholeFlyer(
      [drawn(10), drawn(120), drawn(250)],
      [
        { y: 100, h: 50 },
        { y: 100, h: 60, ins: { u: "u", sy: 0, sh: 60 } },
      ],
    );
    expect(list.map(({ ty }) => ty)).toEqual([10, 240]);
  });
});

describe("the sign and the band", () => {
  it("says what was done, in the singular and in the plural", () => {
    const inserted = { y: 1, h: 2, ins: { u: "u", sy: 0, sh: 1 } };
    expect(cutsSign([{ y: 1, h: 2 }])).toBe("Recortado: 1 parte");
    expect(cutsSign([{ y: 1, h: 2 }, { y: 3, h: 4 }, inserted])).toBe(
      "Recortado: 2 partes · Insertado: 1 sección",
    );
    expect(cutsSign([inserted, inserted])).toBe("Insertado: 2 secciones");
  });

  it("refuses a band too thin or too large, with its words", () => {
    expect(bandProblem(100, 105, 1000)).toBe("thin");
    expect(bandProblem(100, 800, 1000)).toBe("large");
    expect(bandProblem(100, 300, 1000)).toBeNull();
    expect(BAND_PROBLEM_TEXT.officers).toMatch(/oficiales/);
  });
});

describe("the history with cuts", () => {
  it("each step has the logos and the cuts, and says which it was", () => {
    const start = startHistory(photoOf([]), "flyer");
    const cuts = [{ y: 1, h: 2 }];
    const trimmed = noteStep(start, photoOf([], cuts), "flyer");
    expect(trimmed.steps.at(-1)?.label).toBe("Recortar una parte");
    expect(cutsIn(trimmed.steps.at(-1)?.list ?? "")).toEqual(cuts);
    const back = noteStep(trimmed, photoOf([]), "flyer");
    expect(back.steps.at(-1)?.label).toBe("Volver a como estaba (recorte)");
  });

  it("reads what was stored by an older version as having no cuts", () => {
    expect(cutsIn("[]")).toEqual([]);
    expect(cutsIn("null")).toEqual([]);
    expect(listIn("[]")).toEqual([]);
  });
});

describe("the drafts in the browser", () => {
  it("are one per person", () => {
    expect(draftsKey("x")).toBe("fg_borradores_x");
    expect(draftsKey("")).toBe("fg_borradores_anon");
  });

  it("are written and read back; what is not a list is nothing", () => {
    const store = fakeStorage();
    expect(writeStoredDrafts("k", [DRAFT], 5)).toBe("saved");
    expect(readStoredDrafts("k")).toEqual([DRAFT]);
    store.set("k", "no es json");
    expect(readStoredDrafts("k")).toEqual([]);
    store.set("k", '{"lista":3}');
    expect(readStoredDrafts("k")).toEqual([]);
    forgetStoredDrafts("k");
    expect(store.has("k")).toBe(false);
  });

  it("leave out the uploaded logos when they are too heavy", () => {
    const store = fakeStorage();
    const heavy = { ...DRAFT, subidos: { "pc:1:a": "x".repeat(DRAFTS_MAX_SIZE) } };
    expect(writeStoredDrafts("k", [heavy])).toBe("without-uploads");
    expect(store.get("k")).not.toContain("pc:1:a");
  });

  it("try without the logos when there is no room, and say when there is none anyway", () => {
    const light = { ...DRAFT, subidos: { "pc:1:a": "y" } };
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => {
        if (value.includes("pc:1:a")) throw new Error("full");
        store.set(key, value);
      },
    });
    expect(writeStoredDrafts("k", [light])).toBe("without-uploads");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(writeStoredDrafts("k", [light])).toBe("no-room");
    expect(writeStoredDrafts("k", [DRAFT])).toBe("no-room");
    const heavy = { ...DRAFT, subidos: { "pc:1:a": "x".repeat(DRAFTS_MAX_SIZE) } };
    expect(writeStoredDrafts("k", [heavy])).toBe("no-room");
  });

  it("nothing throws without storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStoredDrafts("k")).toEqual([]);
    expect(() => {
      forgetStoredDrafts("k");
    }).not.toThrow();
  });
});

describe("the names of the drafts", () => {
  it("take the first number free on that flyer", () => {
    const works = [blankDraft("a", 9, "Borrador 1"), blankDraft("b", 9, "Borrador 3")];
    expect(freeDraftName(works, 9)).toBe("Borrador 2");
    expect(freeDraftName(works, 7)).toBe("Borrador 1");
  });
});

describe("the sections copied a moment ago", () => {
  const section = { u: "u", sy: 1, sh: 2, sw: 3, nombre: "N" };

  it("keeps five, the last one first, with no repeated one", () => {
    fakeStorage();
    expect(recentSections()).toEqual([]);
    for (const sy of [1, 2, 3, 4, 5, 6, 1]) rememberSection({ ...section, sy });
    expect(recentSections().map(({ sy }) => sy)).toEqual([1, 6, 5, 4, 3]);
  });

  it("leaves out what is not a section, and does not throw without storage", () => {
    const store = fakeStorage();
    store.set("fg_ins_rec", '[{"u":"u","sh":0},3,null,{"u":"u","sh":1}]');
    expect(recentSections()).toEqual([{ u: "u", sh: 1 }]);
    store.set("fg_ins_rec", "{}");
    expect(recentSections()).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(recentSections()).toEqual([]);
    expect(() => {
      rememberSection(section);
    }).not.toThrow();
  });
});

describe("the uploaded logos missing", () => {
  const logos = {
    missingUploads: (keys: readonly string[]) => keys.filter((key) => key !== "pc:1:mem.png"),
  };

  it("are those neither in memory nor in what it brings", () => {
    const list = [
      change(1, 1, { img: "pc:1:mem.png" }),
      change(2, 1, { img: "pc:2:trae.png" }),
      change(3, 1, { img: "pc:3:falta.png" }),
      change(4, 1, { img: "catalogo.png" }),
      change(5, 1, { tipo: "txt", img: "pc:4:texto.png" }),
    ];
    expect(missingUploads(list, { "pc:2:trae.png": "data" }, logos)).toEqual(["pc:3:falta.png"]);
  });

  it("are told by their name", () => {
    expect(missingUploadsText(["pc:3:falta.png"])).toMatch(/«falta\.png»/);
    expect(missingUploadsText(["pc:3"])).toMatch(/«logo»/);
    expect(missingUploadsText(["a", "b"])).toMatch(/Faltan 2 logos/);
  });
});
