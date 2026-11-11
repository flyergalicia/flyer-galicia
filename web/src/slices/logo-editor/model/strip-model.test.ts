import { describe, expect, it, vi } from "vitest";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import type { BrandFilters } from "./brand-filter.ts";
import type { PlacedChange } from "./change.ts";
import {
  canGoBy,
  noteStripStep,
  photoOfStrip,
  photoRead,
  startStripHistory,
} from "./strip-history.ts";
import { adjusted, fitLogo, STRIP_MAX, stripPlaces } from "./strip-layout.ts";
import { currentSelection, overlapOf, stripAt, whereStripOpens } from "./strip-opening.ts";
import {
  backToPlace,
  chosenOf,
  droppedAt,
  grown,
  indexOfLogo,
  isFull,
  movedAll,
  movedBy,
  removedAt,
  rowTouched,
  sizedChosen,
  type StripChoice,
  toggledInGroup,
  withoutAt,
  withoutSuggested,
  withSuggested,
} from "./strip-selection.ts";
import { createStripSession, stripSessionOn } from "./strip-session.ts";
import { candidatesFor, pointsOf, suggestionOrder } from "./strip-suggest.ts";
import type { StripInfo, StripPick, StripRect } from "./strip-types.ts";

const RECT: StripRect = { x: 100, y: 200, w: 1000, h: 300, bg: "rgb(255,255,255)" };

function infoOf(rows: readonly number[], fields: Partial<StripInfo> = {}): StripInfo {
  const count = rows.reduce((sum, row) => sum + row, 0);
  return {
    bg: "rgb(255,255,255)",
    n: count,
    filas: rows.map((n, index) => ({ cy: 250 + index * 100, h: 60, n })),
    porFila: Math.max(0, ...rows),
    medH: 60,
    conTexto: false,
    txtH: 0,
    maxH: 60,
    cajas: [],
    ...fields,
  };
}

function rowsOfPlaces(places: readonly { readonly cy: number }[]): number[] {
  const counts = new Map<number, number>();
  for (const { cy } of places) counts.set(cy, (counts.get(cy) ?? 0) + 1);
  return [...counts.values()];
}

function picks(...logos: readonly string[]): StripPick[] {
  return logos.map((img) => ({ img, t: img.toUpperCase() }));
}

function choice(fields: Partial<StripChoice> = {}): StripChoice {
  return { selection: picks("a", "b", "c", "d"), marked: -1, group: [], sizeOfAll: 1, ...fields };
}

function base(id: string, x: number, y: number, w: number, h: number): PlacedChange {
  return {
    x: x - 2,
    y: y - 2,
    w: w + 4,
    h: h + 4,
    bg: "rgb(1,2,3)",
    img: "",
    t: "Franja",
    ox: x,
    oy: y,
    ow: w,
    oh: h,
    franja: id,
    franjaBase: true,
  };
}

function logoOf(id: string, img: string): PlacedChange {
  return { x: 0, y: 0, w: 0, h: 0, bg: "", img, t: img, ox: 0, oy: 0, ow: 10, oh: 10, franja: id };
}

describe("where the logos of a strip go", () => {
  it("in the rows of the original, evenly", () => {
    expect(rowsOfPlaces(stripPlaces(RECT, infoOf([7, 6]), 0, 8))).toEqual([4, 4]);
    expect(rowsOfPlaces(stripPlaces(RECT, infoOf([7, 7]), 0, 20))).toEqual([10, 10]);
  });

  it("one more row only if each row would get more than 1.5 times the original", () => {
    expect(rowsOfPlaces(stripPlaces(RECT, infoOf([7, 7]), 0, 22))).toEqual([8, 8, 6]);
  });

  it("the rows that stay are at the heights of the original", () => {
    const places = stripPlaces(RECT, infoOf([3, 3]), 0, 6);
    expect(places.map(({ cy }) => cy)).toEqual([250, 250, 250, 350, 350, 350]);
  });

  it("a new row goes inside the zone of the logos, and not on all the box", () => {
    const tops = stripPlaces(RECT, infoOf([7, 7]), 0, 22).map(({ cy }) => cy);
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...tops)).toBeLessThanOrEqual(400);
  });

  it("with one row of the original and several now it shares the whole box", () => {
    const places = stripPlaces(RECT, infoOf([2]), 0, 6);
    expect(new Set(places.map(({ cy }) => cy)).size).toBe(2);
  });

  it("with nothing read it goes up to six per row", () => {
    const places = stripPlaces(RECT, infoOf([]), 0, 8);
    expect(rowsOfPlaces(places)).toEqual([6, 2]);
  });

  it("N per row wins, and the last row goes centered", () => {
    const places = stripPlaces(RECT, infoOf([7, 6]), 3, 4);
    expect(rowsOfPlaces(places)).toEqual([3, 1]);
    expect(places[3]?.cx).toBeCloseTo(RECT.x + RECT.w / 2);
  });

  it("no brand at all is no place at all", () => {
    expect(stripPlaces(RECT, infoOf([7, 6]), 0, 0)).toEqual([]);
  });

  it("with days below, the logo has what is left between rows", () => {
    const plain = stripPlaces(RECT, infoOf([2, 2]), 0, 4)[0]?.h ?? 0;
    const withDays = stripPlaces(
      RECT,
      infoOf([2, 2], { conTexto: true, txtH: 12, maxH: 90 }),
      0,
      4,
    );
    expect(withDays[0]?.h ?? 0).toBeGreaterThanOrEqual(plain);
  });

  it("every logo weighs about the same, without going over its place", () => {
    const place = { cx: 300, cy: 300, w: 100, h: 60 };
    const wide = fitLogo(place, 5);
    expect(wide.tw).toBeLessThanOrEqual(100);
    expect(wide.tx + wide.tw / 2).toBeCloseTo(300);
    const square = fitLogo(place, 1);
    expect(square.th).toBeLessThanOrEqual(60);
  });

  it("what was adjusted by hand grows from its center", () => {
    const box = { tx: 10, ty: 10, tw: 100, th: 50 };
    expect(adjusted({ img: "a", t: "A" }, 1, box)).toEqual(box);
    expect(adjusted({ img: "a", t: "A", k: 2, dx: 5, dy: -5 }, 1, box)).toEqual({
      tx: -35,
      ty: -20,
      tw: 200,
      th: 100,
    });
    expect(adjusted({ img: "a", t: "A" }, 0.5, box).tw).toBe(50);
  });
});

describe("a box marked over strips already built", () => {
  const TOP = base("top", 100, 100, 800, 200);

  it("says how much two boxes take of each other", () => {
    expect(overlapOf(TOP, { ...RECT, x: 2000 })).toBe(0);
    expect(overlapOf(TOP, { x: 100, y: 100, w: 800, h: 200, bg: "" })).toBe(1);
  });

  it("resumes only if its center falls inside", () => {
    const where = whereStripOpens([TOP], { x: 120, y: 110, w: 700, h: 170, bg: "" });
    expect(where).toMatchObject({ kind: "resume", base: TOP, rect: { x: 100, y: 100, w: 800 } });
  });

  it("a new box starting on the lower row of the other is cut, not mixed", () => {
    const where = whereStripOpens([TOP], { x: 100, y: 250, w: 800, h: 260, bg: "" });
    expect(where.kind).toBe("new");
    if (where.kind !== "new") return;
    expect(where.trimmed).toBe(true);
    expect(where.rect.y).toBe(304);
    expect(where.rect.h).toBe(206);
  });

  it("is cut from above too, and from the sides", () => {
    const above = whereStripOpens([TOP], { x: 100, y: 0, w: 800, h: 150, bg: "" });
    expect(above).toMatchObject({ kind: "new", rect: { y: 0, h: 96 } });
    const right = whereStripOpens([base("b", 100, 100, 300, 800)], {
      x: 300,
      y: 200,
      w: 400,
      h: 200,
      bg: "",
    });
    expect(right).toMatchObject({ kind: "new", rect: { x: 404, w: 296 } });
    const left = whereStripOpens([base("b", 500, 100, 300, 800)], {
      x: 200,
      y: 200,
      w: 400,
      h: 200,
      bg: "",
    });
    expect(left).toMatchObject({ kind: "new", rect: { x: 200, w: 296 } });
  });

  it("what is left too small asks for another box", () => {
    const where = whereStripOpens([TOP], { x: 100, y: 290, w: 800, h: 30, bg: "" });
    expect(where).toEqual({ kind: "too-small" });
  });

  it("without strips around it is a new one, as it was marked", () => {
    expect(whereStripOpens([], RECT)).toEqual({ kind: "new", rect: RECT, trimmed: false });
  });

  it("finds the strip at a point", () => {
    expect(stripAt([TOP], 200, 200)).toBe(TOP);
    expect(stripAt([TOP], 2, 2)).toBeUndefined();
  });

  it("resuming brings what the strip has today, with what was adjusted", () => {
    const saved = {
      ...TOP,
      franjaSel: [
        { img: "a", t: "A", k: 1.2 },
        { img: "b", t: "B" },
      ],
    };
    const today = [saved, logoOf("top", "a"), logoOf("top", "z"), logoOf("other", "b")];
    expect(currentSelection(today, saved)).toEqual([
      { img: "a", t: "A", k: 1.2 },
      { img: "z", t: "z" },
    ]);
    expect(currentSelection([TOP], TOP)).toEqual([]);
  });
});

describe("the selection", () => {
  it("what is chosen: with Shift several, and if not the one marked", () => {
    expect(chosenOf(choice())).toEqual([]);
    expect(chosenOf(choice({ marked: 2 }))).toEqual([2]);
    expect(chosenOf(choice({ marked: 9 }))).toEqual([]);
    expect(chosenOf(choice({ marked: 2, group: [0, 2] }))).toEqual([0, 2]);
    expect(chosenOf(choice({ marked: 2, group: [9, 2] }))).toEqual([2]);
  });

  it("knows a logo and its limit", () => {
    expect(indexOfLogo(picks("a", "b"), "b")).toBe(1);
    expect(isFull(picks("a"))).toBe(false);
    expect(isFull(Array.from({ length: STRIP_MAX }, () => ({ img: "x", t: "X" })))).toBe(true);
  });

  it("taking a brand out of the list keeps the mark on its logo", () => {
    expect(withoutAt(choice({ marked: 2 }), 0).marked).toBe(1);
    expect(withoutAt(choice({ marked: 2 }), 2).marked).toBe(-1);
    expect(withoutAt(choice({ marked: 1 }), 2).marked).toBe(1);
    expect(withoutAt(choice({ group: [0, 1] }), 2).group).toEqual([]);
  });

  it("the arrows leave the one that moved marked", () => {
    const up = movedBy(choice({ group: [0, 1] }), 3, -1);
    expect(up.selection.map(({ img }) => img)).toEqual(["a", "b", "d", "c"]);
    expect(up.marked).toBe(2);
    expect(up.group).toEqual([]);
    const stays = movedBy(choice({ marked: 1 }), 0, -1);
    expect(stays.selection).toEqual(choice().selection);
    expect(stays.marked).toBe(1);
  });

  it("the × keeps the mark on the same logo", () => {
    const start = choice({ marked: 3 });
    const after = removedAt(start, 0);
    expect(after.selection[after.marked]?.img).toBe("d");
    expect(removedAt(start, 3).marked).toBe(-1);
    expect(removedAt(choice(), 0).marked).toBe(-1);
  });

  it("dropping a row puts it before that position, and it stays marked", () => {
    const last = droppedAt(choice(), 3, 0);
    expect(last.selection.map(({ img }) => img)).toEqual(["d", "a", "b", "c"]);
    expect(last.marked).toBe(0);
    const first = droppedAt(choice(), 0, 4);
    expect(first.selection.map(({ img }) => img)).toEqual(["b", "c", "d", "a"]);
    expect(first.marked).toBe(3);
    const same = choice();
    expect(droppedAt(same, 1, 1)).toBe(same);
    expect(droppedAt(same, 1, 2)).toBe(same);
    expect(droppedAt(same, 9, 2)).toBe(same);
  });

  it("Shift adds and takes out", () => {
    const one = toggledInGroup(choice({ marked: 0 }), 2);
    expect(one).toMatchObject({ group: [0, 2], marked: 2 });
    const back = toggledInGroup(one, 2);
    expect(back).toMatchObject({ group: [0], marked: 0 });
    expect(toggledInGroup(choice(), 1)).toMatchObject({ group: [1], marked: 1 });
    expect(toggledInGroup(choice({ marked: 1 }), 1)).toMatchObject({ group: [], marked: -1 });
  });

  it("touching a row marks it, and touching it again lets it go", () => {
    expect(rowTouched(choice({ group: [0, 1] }), 2)).toMatchObject({ marked: 2, group: [] });
    expect(rowTouched(choice({ marked: 2 }), 2).marked).toBe(-1);
  });

  it("moving is from where it started, in whole pixels", () => {
    const moved = movedAll(
      choice(),
      [
        { index: 1, dx: 10, dy: 0 },
        { index: 9, dx: 0, dy: 0 },
      ],
      2.4,
      -3.6,
    );
    expect(moved.selection[1]).toMatchObject({ dx: 12, dy: -4 });
  });

  it("the slider of the marked one takes the others in proportion", () => {
    const start = choice({
      selection: [
        { img: "a", t: "A", k: 1 },
        { img: "b", t: "B", k: 2 },
        { img: "c", t: "C" },
      ],
      marked: 0,
      group: [0, 1],
    });
    const sized = sizedChosen(start, 150);
    expect(sized.selection.map(({ k }) => k)).toEqual([1.5, 2.5, undefined]);
    expect(sizedChosen(choice(), 150)).toEqual(choice());
    expect(sizedChosen(choice({ marked: 0 }), 0).selection[0]?.k).toBe(1);
  });

  it("the buttons change what is chosen, within limits", () => {
    expect(grown(choice({ marked: 0 }), 0.1).selection[0]?.k).toBe(1.1);
    const big = choice({ selection: [{ img: "a", t: "A", k: 2.5 }], marked: 0 });
    expect(grown(big, 0.1).selection[0]?.k).toBe(2.5);
    const small = choice({ selection: [{ img: "a", t: "A", k: 0.4 }], marked: 0 });
    expect(grown(small, -0.1).selection[0]?.k).toBe(0.4);
  });

  it("with nothing chosen they change the size of all, by half the step", () => {
    expect(grown(choice(), 0.1).sizeOfAll).toBe(1.05);
    expect(grown(choice({ sizeOfAll: 1.5 }), 0.1).sizeOfAll).toBe(1.5);
    expect(grown(choice({ sizeOfAll: 0.6 }), -0.1).sizeOfAll).toBe(0.6);
  });

  it("back to its place takes the move and the size", () => {
    const start = choice({ selection: [{ img: "a", t: "A", k: 2, dx: 5, dy: 5 }], marked: 0 });
    expect(backToPlace(start).selection[0]).toEqual({ img: "a", t: "A", k: 1, dx: 0, dy: 0 });
  });

  it("what is suggested goes up to the limit, and goes away together", () => {
    const { selection, added } = withSuggested(
      picks("a"),
      [{ img: "a", t: "A" }, null, { img: "b", t: "B" }, { img: "c", t: "C" }],
      2,
    );
    expect(added).toBe(1);
    expect(selection).toEqual([
      { img: "a", t: "A" },
      { img: "b", t: "B", sug: true },
    ]);
    const after = withoutSuggested(choice({ selection, marked: 1, group: [0, 1] }));
    expect(after).toMatchObject({ selection: [{ img: "a", t: "A" }], marked: -1, group: [] });
  });
});

function photo(logos: readonly string[]): string {
  return photoOfStrip({ selection: picks(...logos), perRow: 0, sizeOfAll: 1 });
}

describe("the steps of the window", () => {
  it("a step only if something changed, and what could be redone goes away", () => {
    const start = startStripHistory(photo([]));
    expect(noteStripStep(start, photo([]))).toBe(start);
    const one = noteStripStep(start, photo(["a"]));
    expect(one).toEqual({ steps: [photo([]), photo(["a"])], index: 1 });
    const other = noteStripStep({ ...one, index: 0 }, photo(["b"]));
    expect(other.steps).toEqual([photo([]), photo(["b"])]);
  });

  it("keeps no more than 60", () => {
    let history = startStripHistory(photo([]));
    for (let step = 0; step < 70; step += 1) {
      history = noteStripStep(history, photo([String(step)]));
    }
    expect(history.steps).toHaveLength(60);
    expect(history.index).toBe(59);
  });

  it("says where it can go, and reads a copy back", () => {
    const history = { steps: ["a", "b"], index: 0 };
    expect(canGoBy(history, -1)).toBe(false);
    expect(canGoBy(history, 1)).toBe(true);
    expect(canGoBy({ ...history, index: 1 }, 1)).toBe(false);
    expect(photoRead(photo(["a"]))).toEqual({
      selection: picks("a"),
      perRow: 0,
      sizeOfAll: 1,
    });
    expect(photoRead("null")).toEqual({ selection: [], perRow: 0, sizeOfAll: 1 });
  });
});

const TODAY = new Date("2026-06-15T12:00:00");

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  return {
    id: titulo,
    titulo,
    subtitulo: "Hogar",
    imagen: `${titulo}.png`,
    provincias: ["SALTA"],
    fecha_hasta: "2026-07-15",
    primera_vez: "2020-01-01",
    ...fields,
  };
}

describe("what is suggested", () => {
  it("those of a place go before those online", () => {
    const online = pointsOf(promotion("A", { provincias: [] }), TODAY);
    const here = pointsOf(promotion("A"), TODAY);
    expect(here - online).toBeCloseTo(100, 0);
  });

  it("those that expire later and the new ones weigh more", () => {
    const soon = pointsOf(promotion("A", { fecha_hasta: "2026-06-16" }), TODAY);
    const late = pointsOf(promotion("A", { fecha_hasta: "2027-01-01" }), TODAY);
    expect(late).toBeGreaterThan(soon);
    const fresh = pointsOf(promotion("A", { primera_vez: "2026-06-14" }), TODAY);
    expect(fresh).toBeGreaterThan(pointsOf(promotion("A"), TODAY));
    const noDates = promotion("A", { fecha_hasta: null, primera_vez: null });
    expect(pointsOf(noDates, TODAY)).toBeGreaterThan(100);
    const bad = promotion("A", { fecha_hasta: "pronto", primera_vez: "nunca" });
    expect(pointsOf(bad, TODAY)).toBe(pointsOf(noDates, TODAY));
  });

  it("goes through the categories by turns", () => {
    const list = [
      promotion("H1", { subtitulo: "Hogar", fecha_hasta: "2027-01-01" }),
      promotion("H2", { subtitulo: "Hogar", fecha_hasta: "2026-07-01" }),
      promotion("M1", { subtitulo: "Moda", fecha_hasta: "2026-08-01" }),
      promotion("X1", { subtitulo: null, fecha_hasta: "2026-06-20" }),
    ];
    const titles = suggestionOrder(list, TODAY).map(({ titulo }) => titulo);
    expect(titles).toEqual(["H1", "M1", "X1", "H2"]);
  });

  it("looks a bit beyond what it needs", () => {
    const list = Array.from({ length: 30 }, (_item, index) => promotion(`P${String(index)}`));
    expect(candidatesFor(list, 3, TODAY)).toHaveLength(10);
  });
});

const FILTERS: BrandFilters = {
  search: "",
  category: "",
  province: "",
  locality: "",
  onePerBrand: true,
  hideOnline: false,
  onlyPercent: false,
};

function session() {
  return createStripSession({
    id: "fr1",
    rect: RECT,
    info: infoOf([2]),
    base: null,
    art: "flyer.png",
    selection: picks("a"),
    perRow: 0,
    sizeOfAll: 1,
    filters: null,
  });
}

describe("a strip being armed", () => {
  it("tells whoever listens, until it stops listening", () => {
    const strip = session();
    const listener = vi.fn<() => void>();
    const stop = strip.subscribe(listener);
    strip.setPerRow(3);
    expect(listener).toHaveBeenCalledOnce();
    stop();
    strip.setSizeOfAll(120);
    expect(listener).toHaveBeenCalledOnce();
    expect(strip.getState()).toMatchObject({ perRow: 3, sizeOfAll: 1.2 });
    strip.setSizeOfAll(0);
    expect(strip.getState().sizeOfAll).toBe(1);
  });

  it("a step is written down a moment after the last touch, and undoing brings it back", () => {
    vi.useFakeTimers();
    const strip = session();
    strip.change((now) => ({ ...now, selection: [...now.selection, ...picks("b")] }));
    strip.change((now) => ({ ...now, selection: [...now.selection, ...picks("c")] }));
    expect(strip.isSettled()).toBe(false);
    expect(strip.canUndo()).toBe(false);
    vi.advanceTimersByTime(450);
    expect(strip.isSettled()).toBe(true);
    expect(strip.canUndo()).toBe(true);
    strip.change((now) => ({ ...now, marked: 1 }));
    strip.undo();
    expect(strip.getState().selection).toEqual(picks("a"));
    expect(strip.getState().marked).toBe(-1);
    expect(strip.canRedo()).toBe(true);
    strip.redo();
    expect(strip.getState().selection).toHaveLength(3);
    strip.redo();
    expect(strip.getState().selection).toHaveLength(3);
    strip.close();
    expect(strip.isAlive()).toBe(false);
    vi.useRealTimers();
  });

  it("undoing what was just done writes it down first", () => {
    vi.useFakeTimers();
    const strip = session();
    strip.change((now) => ({ ...now, selection: [] }));
    strip.undo();
    expect(strip.getState().selection).toEqual(picks("a"));
    vi.useRealTimers();
  });

  it("what is not a change of the selection is not a step", () => {
    const strip = session();
    strip.toggleLarge();
    strip.setPutting(true);
    strip.logoArrived();
    expect(strip.getState()).toMatchObject({ isLarge: true, isPutting: true, logosArrived: 1 });
    expect(strip.isSettled()).toBe(true);
  });

  it("comes back from choosing, keeping what was adjusted of each brand", () => {
    const strip = createStripSession({
      id: "fr1",
      rect: RECT,
      info: infoOf([2]),
      base: null,
      art: "flyer.png",
      selection: [{ img: "a", t: "A", k: 2 }],
      perRow: 0,
      sizeOfAll: 1,
      filters: null,
    });
    expect(strip.hasComeBack()).toBe(false);
    strip.keepFilters(FILTERS);
    expect(strip.filters()).toBe(FILTERS);
    strip.comeBack(
      [
        { logo: "b", title: "B" },
        { logo: "a", title: "A" },
      ],
      { ...FILTERS, province: "SALTA" },
    );
    expect(strip.hasComeBack()).toBe(true);
    expect(strip.getState().selection).toEqual([
      { img: "b", t: "B" },
      { img: "a", t: "A", k: 2 },
    ]);
    expect(strip.filters()?.province).toBe("SALTA");
    strip.close();
  });

  it("keeps what was drawn", () => {
    const strip = session();
    expect(strip.drawing().width).toBe(0);
    strip.noteDrawing({ x0: 1, y0: 2, width: 3, boxes: [null] });
    expect(strip.drawing().width).toBe(3);
  });

  it("opens on a place, with what was left chosen for it", () => {
    const place = { rect: RECT, info: infoOf([2]), art: "flyer.png" };
    const fresh = stripSessionOn({ ...place, base: null, selection: [] }, null);
    expect(fresh.id).toMatch(/^fr\d+$/);
    expect(fresh.getState()).toMatchObject({ selection: [], perRow: 0, sizeOfAll: 1 });
    const built = { ...base("top", 1, 1, 1, 1), franjaCols: 3, franjaKt: 1.2 };
    const resumed = stripSessionOn({ ...place, base: built, selection: picks("a") }, null);
    expect(resumed.id).toBe("top");
    expect(resumed.getState()).toMatchObject({ perRow: 3, sizeOfAll: 1.2 });
    const pending = { selection: picks("z"), perRow: 4, filters: FILTERS };
    const waiting = stripSessionOn({ ...place, base: built, selection: picks("a") }, pending);
    expect(waiting.getState()).toMatchObject({ selection: picks("z"), perRow: 4 });
    expect(waiting.filters()).toBe(FILTERS);
  });
});
