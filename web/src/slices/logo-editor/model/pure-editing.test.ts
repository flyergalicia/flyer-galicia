import { describe, expect, it } from "vitest";
import {
  aligned,
  centered,
  chosenIn,
  copyOf,
  deletedFrom,
  moved,
  resizedTo,
  sameSize,
  spread,
  withoutChosen,
} from "./arrange.ts";
import {
  boxKeys,
  clampPercent,
  coverOf,
  fromFlyerKey,
  indexOfPlace,
  isAdjustable,
  isFromFlyer,
  isUnderStrip,
  isUploaded,
  liftFromFlyer,
  logoAt,
  percentOf,
  type PlacedChange,
  withChange,
} from "./change.ts";
import { guidesFor, keyboardLines } from "./guides.ts";
import {
  canRedo,
  canUndo,
  emptyPhoto,
  listIn,
  noteStep,
  photoOf,
  startHistory,
  stepLabel,
} from "./history.ts";

const PLACE = { x: 10, y: 20, w: 100, h: 50, bg: "rgb(255,255,255)" };

function logo(fields: Partial<PlacedChange> = {}): PlacedChange {
  return {
    ...coverOf(PLACE, "a.png", "Marca"),
    tx: 10,
    ty: 20,
    tw: 100,
    th: 50,
    bw: 100,
    bh: 50,
    ...fields,
  };
}

describe("a change", () => {
  it("covers a bit more than its place and starts drawing nothing", () => {
    const change = coverOf(PLACE, "", "");
    expect(change).toMatchObject({ x: 6, y: 16, w: 108, h: 58, ox: 10, oy: 20, ow: 100, oh: 50 });
    expect(isAdjustable(change)).toBe(false);
    expect(change.tx).toBeUndefined();
  });

  it("a logo lifted from the flyer stays exactly in its place, with its own picture", () => {
    const lifted = liftFromFlyer(PLACE);
    expect(lifted.img).toBe(fromFlyerKey(PLACE));
    expect(lifted).toMatchObject({ tx: 10, ty: 20, tw: 100, th: 50, bw: 100, bh: 50 });
    expect(isFromFlyer(lifted.img)).toBe(true);
    expect(isUploaded("pc:1:a.png")).toBe(true);
  });

  it("is found by a point, with a margin, and the last one put wins", () => {
    const list = [logo(), logo({ tx: 50 })];
    expect(logoAt(list, 60, 30)).toBe(1);
    expect(logoAt(list, 8, 30)).toBe(0);
    expect(logoAt(list, 500, 500)).toBe(-1);
    expect(logoAt([coverOf(PLACE, "", "")], 40, 40)).toBe(-1);
  });

  it("is found by its place, unless it was asked for by its number", () => {
    const list = [logo(), logo({ dup: true })];
    expect(indexOfPlace(list, PLACE)).toBe(0);
    expect(indexOfPlace(list, { ...PLACE, indice: 1 })).toBe(1);
    expect(indexOfPlace(list, { ...PLACE, indice: -1 })).toBe(-1);
    expect(indexOfPlace(list, { ...PLACE, x: 500 })).toBe(-1);
    const base = logo({ franjaBase: true });
    expect(indexOfPlace([base], { ...PLACE, indice: 0 })).toBe(-1);
  });

  it("knows the place under a strip", () => {
    expect(isUnderStrip([logo({ franjaBase: true })], PLACE)).toBe(true);
    expect(isUnderStrip([logo()], PLACE)).toBe(false);
  });

  it("replaces what has its place, or goes at the end", () => {
    const list = [logo()];
    expect(withChange(list, 0, logo({ t: "Otra" })).index).toBe(0);
    expect(withChange(list, -1, logo()).list).toHaveLength(2);
  });

  it("has a name for its box that stays when it moves, and differs from a copy in its place", () => {
    expect(boxKeys([logo()])).toEqual(boxKeys([logo({ tx: 300, ty: 400 })]));
    const [first, copy] = boxKeys([logo(), logo({ dup: true })]);
    expect(first).not.toBe(copy);
  });

  it("has a percentage, limited on both sides", () => {
    expect(percentOf(logo({ tw: 150 }))).toBe(150);
    expect(percentOf(logo({ tipo: "txt", fs: 20, bfs: 10 }))).toBe(200);
    expect(clampPercent(10)).toBe(30);
    expect(clampPercent(1000)).toBe(250);
  });
});

describe("what is done to several", () => {
  const three = [
    logo({ tx: 0, ty: 0, tw: 10, th: 10 }),
    logo({ tx: 100, ty: 50, tw: 20, th: 20 }),
    logo({ tx: 400, ty: 90, tw: 40, th: 40 }),
  ];

  it("moves only the chosen, and returns a new list", () => {
    const result = moved(three, [1], 5, -5);
    expect(result[1]).toMatchObject({ tx: 105, ty: 45 });
    expect(result[0]).toBe(three[0]);
    expect(three[1]?.tx).toBe(100);
  });

  it("resizes from the center, the others in the same proportion", () => {
    const list = [logo(), logo({ tw: 200, th: 100, bw: 100, bh: 50, tx: 0, ty: 0 })];
    const result = resizedTo(list, [0, 1], 0, 150);
    expect(result[0]).toMatchObject({ tw: 150, th: 75, tx: -15 });
    expect(result[1]?.tw).toBe(250);
    expect(resizedTo(list, [0], 9, 150)).toBe(list);
  });

  it("centers in the place it was given", () => {
    const [entry] = centered([logo({ tx: 400, tw: 20, th: 10 })], [0]);
    expect(entry).toMatchObject({ tx: 50, ty: 40 });
  });

  it("aligns against the main one, in the three ways", () => {
    expect(aligned(three, [0, 1], 1, "top")[0]?.ty).toBe(50);
    expect(aligned(three, [0, 1], 1, "middle")[0]?.ty).toBe(55);
    expect(aligned(three, [0, 1], 1, "bottom")[0]?.ty).toBe(60);
    expect(aligned(three, [0], 0, "top")).toBe(three);
  });

  it("spreads with the same space, leaving the first and the last", () => {
    const [first, middle, last] = spread(three, [0, 1, 2]);
    const gapOne = (middle?.tx ?? 0) - ((first?.tx ?? 0) + (first?.tw ?? 0));
    const gapTwo = (last?.tx ?? 0) - ((middle?.tx ?? 0) + (middle?.tw ?? 0));
    expect(gapOne).toBeCloseTo(gapTwo, 5);
    expect(first?.tx).toBe(0);
    expect(last?.tx).toBe(400);
    expect(spread(three, [0, 1])).toBe(three);
  });

  it("gives the same height as the main one", () => {
    const list = [
      logo({ tw: 100, th: 50, bw: 100, bh: 50 }),
      logo({ tw: 40, th: 25, bw: 40, bh: 25 }),
    ];
    expect(sameSize(list, [0, 1], 0)[1]?.th).toBeCloseTo(50, 0);
    expect(sameSize(list, [0], 0)).toBe(list);
  });

  it("a copy covers nothing, falls apart, and leaves the strip behind", () => {
    const copy = copyOf(logo({ franja: "f1", vacio: true }), 16);
    expect(copy).toMatchObject({ w: 0, h: 0, dup: true, tx: 26, ty: 36, ox: 26, oy: 36 });
    expect(copy.franja).toBeUndefined();
    expect(copy.vacio).toBeUndefined();
  });

  it("deleting leaves the place covered; what covered nothing goes away", () => {
    const list = [logo(), logo({ dup: true }), logo({ franja: "f" }), logo({ w: 0, h: 0 })];
    const result = deletedFrom(list, [0, 1, 2, 3]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ img: "", t: "", w: 108 });
    expect(result[0]?.tx).toBeUndefined();
    const base = logo({ franjaBase: true });
    expect(deletedFrom([base], [0])).toEqual([base]);
    expect(withoutChosen(list, [0, 1])).toHaveLength(2);
  });

  it("what is chosen: the group, or the one alone, and only what can be moved", () => {
    const list = [logo(), logo(), coverOf(PLACE, "", "")];
    expect(chosenIn(list, 1, [0, 1])).toEqual([0, 1]);
    expect(chosenIn(list, 1, [])).toEqual([1]);
    expect(chosenIn(list, 2, [])).toEqual([]);
    expect(chosenIn(list, -1, [0])).toEqual([]);
  });
});

describe("the guides", () => {
  const list = [logo({ tx: 0, ty: 0, tw: 100, th: 50 }), logo({ tx: 300, ty: 0, tw: 100, th: 50 })];

  it("stick to the closest line and say where it is", () => {
    const { dx, dy, lines } = guidesFor({
      list,
      moving: [{ index: 1, tx: 300, ty: 3 }],
      main: 1,
      dx: 0,
      dy: 0,
      screenScale: 1,
      flyerWidth: 0,
    });
    expect(dy).toBe(-3);
    expect(lines.some(({ axis }) => axis === "horizontal")).toBe(true);
    expect(dx).toBe(0);
  });

  it("with the keyboard they do not stick: they say how far it is", () => {
    const near = keyboardLines([{ axis: "horizontal", at: 10, distance: 3 }]);
    expect(near[0]).toMatchObject({ near: true, exact: false });
    const exact = keyboardLines([{ axis: "horizontal", at: 10, distance: 0 }]);
    expect(exact[0]).toMatchObject({ near: false, exact: true });
  });

  it("look at the middle of the flyer too", () => {
    const { lines } = guidesFor({
      list: [logo({ tx: 348, tw: 100, ow: 0 })],
      moving: [{ index: 0, tx: 348, ty: 0 }],
      main: 0,
      dx: 0,
      dy: 0,
      screenScale: 1,
      flyerWidth: 800,
    });
    expect(lines.some(({ axis, at }) => axis === "vertical" && at === 400)).toBe(true);
  });
});

describe("Deshacer", () => {
  const art = "flyer.jpg";

  it("adds a step only if the list changed, and what could be redone goes away", () => {
    const start = startHistory(emptyPhoto(), art);
    const one = noteStep(start, photoOf([logo()]), art);
    expect(one.steps).toHaveLength(2);
    expect(noteStep(one, photoOf([logo()]), art)).toBe(one);
    const back = { ...one, index: 0 };
    expect(canUndo(one, art)).toBe(true);
    expect(canRedo(back, art)).toBe(true);
    expect(canUndo(one, "otro.jpg")).toBe(false);
    expect(noteStep(back, photoOf([logo({ t: "Otra" })]), art).steps).toHaveLength(2);
  });

  it("starts over on another flyer", () => {
    const start = startHistory(photoOf([logo()]), art);
    const next = noteStep(start, photoOf([logo()]), "otro.jpg");
    expect(next.art).toBe("otro.jpg");
    expect(next.index).toBe(1);
    expect(listIn(next.steps[0]?.list ?? "")).toEqual([]);
    expect(listIn("[]")).toEqual([]);
  });

  it("keeps 60 steps", () => {
    let history = startHistory(emptyPhoto(), art);
    for (let step = 0; step < 70; step += 1) {
      history = noteStep(history, photoOf([logo({ tx: step })]), art);
    }
    expect(history.steps).toHaveLength(61);
  });

  it("names each step", () => {
    const text = logo({ tipo: "txt", t: "Lunes", texto: "Lunes", fs: 10 });
    const empty = coverOf(PLACE, "", "");
    const cases: readonly (readonly [readonly PlacedChange[], readonly PlacedChange[], string])[] =
      [
        [[logo()], [], "Volver todo al original"],
        [[], [logo()], "Poner Marca"],
        [[], [text], "Poner el texto «Lunes»"],
        [[], [empty], "Dejar un lugar vacío"],
        [[], [logo({ dup: true })], "Duplicar Marca"],
        [[logo()], [logo({ img: "b.png", t: "Otra" })], "Cambiar Marca por Otra"],
        [[logo()], [{ ...empty }], "Dejar vacío"],
        [[text], [{ ...text, texto: "Martes", t: "Martes" }], "Cambiar el texto «Martes»"],
        [[logo()], [logo({ tw: 200 })], "Tamaño de Marca"],
        [[logo()], [logo({ tx: 99 })], "Mover Marca"],
        [[logo({ t: "Logo del flyer" })], [logo({ t: "Logo del flyer", tx: 99 })], "Mover el logo"],
        [[], [logo({ franjaBase: true, franja: "f" })], "Armar franja"],
        [
          [logo({ franjaBase: true, franja: "f" }), logo({ franja: "f" })],
          [logo()],
          "Volver la franja al original",
        ],
        [[logo(), logo({ t: "B" })], [logo({ t: "B" })], "Volver Marca al original"],
        [[logo()], [logo(), logo({ dup: true }), logo({ dup: true })], "Duplicar 2"],
        [[logo(), logo()], [logo({ tx: 1 }), logo({ tx: 2 })], "Mover 2 logos"],
        [[logo(), logo()], [logo({ tw: 1 }), logo({ tw: 2 })], "Tamaño de 2 logos"],
        [[logo(), logo()], [logo({ img: "x" }), logo({ img: "y" })], "2 cambios"],
      ];
    for (const [before, after, label] of cases) expect(stepLabel(before, after)).toBe(label);
  });
});
