import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlyerHistory, type FlyerHistory, whenOf } from "./flyer-history.ts";
import type { HistoryItem } from "./stored-flyer.ts";

const KEY = "fg_hist_ana";

function canvas(width = 240, height = 480) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

function add(history: FlyerHistory, company: string, option = 9) {
  history.add({
    values: { empresa: company },
    fileName: `Flyer ${company}`,
    canvas: canvas(),
    cashback: 1,
    option,
  });
}

function item(company: string, ts: number): HistoryItem {
  return {
    v: { empresa: company },
    fn: `Flyer ${company}`,
    thumb: "",
    hora: "1:00",
    ts,
    ac: 0,
    opt: 9,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the flyers that came out", () => {
  it("the last one first, with what is needed to bring it back", () => {
    const history = createFlyerHistory();
    add(history, "UNO", 7);
    add(history, "DOS");
    const [first, second] = history.getItems();
    expect(first?.v.empresa).toBe("DOS");
    expect(second).toMatchObject({ fn: "Flyer UNO", ac: 1, opt: 7 });
    expect(second?.thumb).toMatch(/^data:image\/jpeg/);
    expect(second?.hora).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it("what is stored does not follow what happens to the values after", () => {
    const history = createFlyerHistory();
    const values = { empresa: "UNO", logos: [{ x: 1, y: 1, w: 1, h: 1, bg: "" }] };
    history.add({ values, fileName: "F", canvas: canvas(), cashback: 0, option: 9 });
    values.logos[0] = { x: 9, y: 9, w: 9, h: 9, bg: "" };
    expect(history.getItems()[0]?.v.logos?.[0]?.x).toBe(1);
  });

  it("the picture is small: it has to fit in the browser", () => {
    const history = createFlyerHistory();
    const big = canvas(2000, 6000);
    history.add({ values: { empresa: "G" }, fileName: "G", canvas: big, cashback: 0, option: 9 });
    const thumb = history.getItems()[0]?.thumb ?? "";
    expect(thumb.length).toBeLessThan(big.toDataURL("image/jpeg", 0.25).length);
  });

  it("if the small picture cannot be made, the whole one goes", () => {
    const history = createFlyerHistory();
    const big = canvas();
    vi.spyOn(document, "createElement").mockImplementationOnce(() => {
      throw new Error("No");
    });
    history.add({ values: { empresa: "U" }, fileName: "U", canvas: big, cashback: 0, option: 9 });
    expect(history.getItems()[0]?.thumb).toBe(big.toDataURL("image/jpeg", 0.25));
  });

  it("ten while the page lives, and it tells who listens", () => {
    const history = createFlyerHistory();
    const listener = vi.fn<() => void>();
    const stop = history.subscribe(listener);
    for (let number = 0; number < 12; number += 1) add(history, `N${String(number)}`);
    expect(history.getItems()).toHaveLength(10);
    expect(history.getItems()[0]?.v.empresa).toBe("N11");
    expect(listener).toHaveBeenCalledTimes(12);
    stop();
    add(history, "OTRA");
    expect(listener).toHaveBeenCalledTimes(12);
  });

  it("one can be taken out", () => {
    const history = createFlyerHistory();
    add(history, "UNO");
    add(history, "DOS");
    history.remove(0);
    expect(history.getItems().map(({ v }) => v.empresa)).toEqual(["UNO"]);
  });
});

describe("with the faculty", () => {
  it("twenty, and they stay in the browser of that person", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    for (let number = 0; number < 22; number += 1) add(history, `N${String(number)}`);
    expect(history.getItems()).toHaveLength(20);
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    expect(kept).toHaveLength(20);
  });

  it("taking one out is kept too", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    add(history, "UNO");
    history.remove(0);
    expect(localStorage.getItem(KEY)).toBe("[]");
  });

  it("what was kept joins what this page made, without repeating, newest first", () => {
    const history = createFlyerHistory();
    add(history, "NUEVA");
    const made = history.getItems()[0];
    localStorage.setItem(
      KEY,
      JSON.stringify([item("VIEJA", 5), item("OTRA", 9), made, { nada: true }, null]),
    );
    const listener = vi.fn<() => void>();
    history.subscribe(listener);
    history.keepFor("ana");
    expect(history.getItems().map(({ v }) => v.empresa)).toEqual(["NUEVA", "OTRA", "VIEJA"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("two without their moment are not the same", () => {
    const history = createFlyerHistory();
    localStorage.setItem(KEY, JSON.stringify([item("A", 0), item("A", 0)]));
    history.keepFor("ana");
    expect(history.getItems()).toHaveLength(2);
  });

  it("the same person twice reads nothing again", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    localStorage.setItem(KEY, JSON.stringify([item("VIEJA", 5)]));
    history.keepFor("ana");
    expect(history.getItems()).toEqual([]);
  });

  it("what cannot be read is as if nothing was kept", () => {
    const history = createFlyerHistory();
    localStorage.setItem(KEY, "{no es json");
    history.keepFor("ana");
    expect(history.getItems()).toEqual([]);
    localStorage.setItem("fg_hist_otra", JSON.stringify({ not: "a list" }));
    history.keepFor("otra");
    expect(history.getItems()).toEqual([]);
  });

  it("with no room, fewer flyers are better than none", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    for (let number = 0; number < 6; number += 1) add(history, `N${String(number)}`);
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("Quota");
    });
    add(history, "UNA MAS");
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    expect(kept).toHaveLength(5);
    expect(history.getItems(), "the page keeps them all").toHaveLength(7);
  });

  it("with the storage closed, it stays in the page", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Closed");
    });
    add(history, "UNO");
    expect(history.getItems()).toHaveLength(1);
  });

  it("when it goes away, nothing more is kept and it goes back to ten", () => {
    const history = createFlyerHistory();
    history.keepFor("ana");
    history.stopKeeping();
    add(history, "UNO");
    expect(localStorage.getItem(KEY)).toBeNull();
    for (let number = 0; number < 12; number += 1) add(history, `N${String(number)}`);
    expect(history.getItems()).toHaveLength(10);
  });
});

const NOW = new Date(2026, 10, 5, 18, 0);
const at = (date: Date) => whenOf({ ts: date.getTime(), hora: "9:05" }, NOW);

describe("when it was made", () => {
  it("today, the hour; yesterday, it says so; otherwise, the day", () => {
    expect(at(new Date(2026, 10, 5, 9, 5))).toBe("9:05");
    expect(at(new Date(2026, 10, 4, 9, 5))).toBe("ayer 9:05");
    expect(at(new Date(2026, 8, 12, 9, 5))).toBe("12/09 9:05");
  });

  it("without a moment, what it says", () => {
    expect(whenOf({ ts: 0, hora: "9:05" }, NOW)).toBe("9:05");
    expect(whenOf({ ts: 0, hora: "9:05" })).toBe("9:05");
  });
});
