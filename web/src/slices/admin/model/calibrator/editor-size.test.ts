import { describe, expect, it } from "vitest";
import {
  cornerDragged,
  EDITOR_SIZE_KEY,
  editorBox,
  enlarged,
  loadEditorSize,
  pictureHeight,
  pictureMaxOf,
  saveEditorSize,
  sizeForgotten,
  splitDragged,
} from "./editor-size.ts";

const WIDE = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 844 };

function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    items,
  };
}

describe("the size of the editor", () => {
  it("is remembered in this browser; what cannot be read is as it comes", () => {
    const storage = memory();
    expect(loadEditorSize(storage)).toEqual({});
    saveEditorSize(storage, { w: 900, h: 600 });
    expect(storage.items.get(EDITOR_SIZE_KEY)).toBe('{"w":900,"h":600}');
    expect(loadEditorSize(storage)).toEqual({ w: 900, h: 600 });
    expect(loadEditorSize(memory({ [EDITOR_SIZE_KEY]: "{roto" }))).toEqual({});
    expect(loadEditorSize(memory({ [EDITOR_SIZE_KEY]: "3" }))).toEqual({});
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Sin lugar");
      },
    };
    expect(() => {
      saveEditorSize(full, { w: 1 });
    }).not.toThrow();
  });

  it("stays inside the window, never smaller than 480 × 320, and is not touched on a phone", () => {
    expect(editorBox({ w: 5000, h: 5000 }, WIDE)).toEqual({ width: 1334, height: 768 });
    expect(editorBox({ w: 100, h: 100 }, WIDE)).toEqual({ width: 480, height: 320 });
    expect(editorBox({}, WIDE)).toEqual({ width: null, height: null });
    expect(editorBox({ w: 900, h: 600 }, PHONE)).toEqual({ width: null, height: null });
  });

  it("the picture keeps the controls at least 60 px, and is never under 150", () => {
    expect(pictureHeight({ bh: 9000 }, WIDE, null, 100)).toBe(768 - 100 - 9 - 60);
    expect(pictureHeight({ bh: 9000 }, WIDE, 500, 100)).toBe(500 - 100 - 9 - 60);
    expect(pictureHeight({ bh: 10 }, WIDE, null, 100)).toBe(150);
    expect(pictureHeight({}, WIDE, null, 100)).toBeNull();
    expect(pictureHeight({ bh: 300 }, PHONE, null, 100)).toBeNull();
  });

  it("«Ampliar» takes almost the whole window, and again goes back to as it comes", () => {
    const big = enlarged({ bh: 300 }, WIDE);
    expect(big).toEqual({ w: 1334, h: 768, bh: 300 });
    expect(enlarged(big, WIDE)).toEqual({});
    expect(enlarged({}, WIDE)).toEqual({ w: 1334, h: 768, bh: null });
  });

  it("the bar fixes the height of the picture; the corner grows twice what it is dragged", () => {
    const start = { x: 100, y: 100, width: 700, height: 600, pictureHeight: 300, pictureMax: 400 };
    expect(splitDragged({ w: 1 }, start, 40)).toEqual({ w: 1, bh: 240 });
    expect(splitDragged({}, start, 1000)).toEqual({ bh: 400 });
    expect(splitDragged({}, start, -1000)).toEqual({ bh: 150 });
    expect(cornerDragged({ bh: 5 }, start, 60, 80)).toEqual({ bh: 5, w: 620, h: 560 });
    expect(pictureMaxOf(300, 200)).toBe(440);
  });

  it("a double click forgets the part dragged", () => {
    expect(sizeForgotten({ w: 1, h: 2, bh: 3 }, "split")).toEqual({ w: 1, h: 2 });
    expect(sizeForgotten({ w: 1, h: 2, bh: 3 }, "corner")).toEqual({ bh: 3 });
    expect(sizeForgotten({}, "split")).toEqual({});
  });
});
