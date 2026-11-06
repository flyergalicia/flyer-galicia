import { describe, expect, it } from "vitest";
import { benefitLines } from "./benefit.ts";
import { startingCalibration } from "./calibration.ts";
import { arrowStep, moveZone } from "./moves.ts";
import {
  amountBoxes,
  type CalibratorFrame,
  lineLabel,
  zoneAt,
  zoneRects,
  zonesOf,
} from "./zones.ts";

function frame(tab: CalibratorFrame["tab"] = "flyer", optionName = "Combustible"): CalibratorFrame {
  return { cfg: startingCalibration(), tab, optionName, imageHeight: 6457 };
}

const ids = (zones: readonly { id: string }[]) => zones.map(({ id }) => id);

describe("the zones each tab offers", () => {
  it("Flyer Galicia: the company, the four amounts together and one by one, officers and legal", () => {
    const zones = zonesOf(frame());
    expect(ids(zones)).toEqual([
      "empresa",
      "montos",
      "mb0",
      "mb1",
      "mb2",
      "mb3",
      "asesores",
      "legal",
    ]);
    expect(zones.map(({ label }) => label)).toEqual([
      "Empresa",
      "Montos (todo)",
      "Eminent Black",
      "Eminent Platinum",
      "Plus Gold",
      "Plus",
      "Asesores",
      "Legales",
    ]);
  });

  it("Flyer Sueldo: one cashback instead of the four, with no hidden boxes", () => {
    const salary = frame("sueldo");
    expect(ids(zonesOf(salary))).toEqual(["empresa", "cashback", "asesores", "legal"]);
    expect(amountBoxes(salary)).toEqual([]);
  });

  it("Flyer Rubros: the whole benefit and each line first", () => {
    const category = frame("rubros");
    const zones = zonesOf(category);
    expect(ids(zones).slice(0, 3)).toEqual(["blAll", "bl0", "bl1"]);
    expect(zones[1]?.label).toBe("¡Beneficio exclus…");
    expect(ids(zones)).toContain("legal");
  });

  it("a fifth box has a name and a color too", () => {
    const many = frame();
    many.cfg.montos.boxes.push({ xc: 1, ew: 1, col: "#000" });
    expect(amountBoxes(many)).toHaveLength(4);
  });

  it("the name of a line has no marks, and is cut when long", () => {
    expect(lineLabel("**25%** {nombre} {importe2} {importe}", 0)).toBe("25% NOMBRE $ $");
    expect(lineLabel("", 2)).toBe("Línea 3");
    expect(lineLabel("Tope de reintegro mensual", 0)).toBe("Tope de reintegro…");
  });
});

describe("where each zone is", () => {
  it("the company around its line, the amounts box by box with the group around them", () => {
    const rects = zoneRects(frame());
    expect(rects.empresa).toEqual({ x: 70, y: 673, w: 1100, h: 104 });
    expect(rects.mb0).toEqual({ x: 114, y: 1040, w: 220, h: 58 });
    expect(rects.montos).toEqual({ x: 104, y: 1032, w: 1006.5, h: 74 });
    expect(rects.cashback).toEqual({ x: 340, y: 1029, w: 560, h: 80 });
  });

  it("what is anchored at the bottom follows a taller picture", () => {
    const taller = { ...frame(), imageHeight: 6557 };
    expect(zoneRects(taller).asesores?.y).toBe(5430);
    expect(zoneRects(taller).legal?.y).toBe(5695);
  });

  it("the lines of the benefit, centered or from the left, and the whole box around them", () => {
    const category = frame("rubros");
    const rects = zoneRects(category);
    expect(rects.bl0?.x).toBeLessThan(723);
    expect(rects.blAll?.y).toBeLessThan(rects.bl0?.y ?? 0);
    const lines = category.cfg.benef.lineas ?? [];
    lines[0]!.align = "left";
    lines[0]!.lh = 20;
    expect(zoneRects(category).bl0).toMatchObject({ x: 723, h: 40 });
  });

  it("with no boxes there is no group of amounts", () => {
    const none = frame();
    none.cfg.montos.boxes = [];
    expect(zoneRects(none).montos).toBeUndefined();
  });
});

describe("what a click takes", () => {
  it("a single box before the group, and nothing outside every zone", () => {
    const flyer = frame();
    expect(zoneAt(flyer, null, 224, 1069)).toEqual({ zone: "mb0", handle: null });
    expect(zoneAt(flyer, null, 110, 1035)).toEqual({ zone: "montos", handle: null });
    expect(zoneAt(flyer, null, 620, 725)).toEqual({ zone: "empresa", handle: null });
    expect(zoneAt(flyer, null, 5, 5)).toBeNull();
  });

  it("the corner of the legal text changes its size", () => {
    const flyer = frame();
    expect(zoneAt(flyer, null, 39 + 1162, 6300)).toEqual({ zone: "legal", handle: "br" });
    expect(zoneAt(flyer, "legal", 39 + 1162, 6300)).toEqual({ zone: "legal", handle: "br" });
  });

  it("with a zone chosen, only that one is taken", () => {
    const flyer = frame();
    expect(zoneAt(flyer, "empresa", 224, 1069)).toBeNull();
    expect(zoneAt(flyer, "empresa", 620, 725)).toEqual({ zone: "empresa", handle: null });
    expect(zoneAt(flyer, "legal", 100, 5700)).toEqual({ zone: "legal", handle: null });
  });

  it("in Flyer Rubros a line is taken before the whole box", () => {
    const category = frame("rubros");
    const line = zoneRects(category).bl2;
    expect(zoneAt(category, null, (line?.x ?? 0) + 1, (line?.y ?? 0) + 1)).toEqual({
      zone: "bl2",
      handle: null,
    });
  });
});

describe("moving a zone", () => {
  it("the company moves with its frame", () => {
    const flyer = frame();
    moveZone(flyer, { zone: "empresa", handle: null }, 10, 40);
    expect(flyer.cfg.empresa).toMatchObject({ yc: 765, xc: 630, ex: 80 });
  });

  it("the group moves every box; a box with its own row goes along", () => {
    const flyer = frame();
    flyer.cfg.montos.boxes[2]!.y = 1200;
    moveZone(flyer, { zone: "montos", handle: null }, 5, 20);
    expect(flyer.cfg.montos.y).toBe(1089);
    expect(flyer.cfg.montos.boxes.map(({ xc }) => xc)).toEqual([229, 498, 765, 1013]);
    expect(flyer.cfg.montos.boxes[2]?.y).toBe(1220);
    expect(flyer.cfg.montos.boxes[0]?.y).toBeUndefined();
  });

  it("a box alone gets a row of its own and the next one stays", () => {
    const flyer = frame();
    moveZone(flyer, { zone: "mb0", handle: null }, 30, 10);
    expect(flyer.cfg.montos.boxes[0]).toMatchObject({ xc: 254, y: 1079 });
    expect(flyer.cfg.montos.boxes[1]).toEqual({ xc: 493, ew: 215, col: "#1d4070" });
    moveZone(flyer, { zone: "mb9", handle: null }, 30, 10);
    expect(flyer.cfg.montos.y).toBe(1069);
  });

  it("the cashback, the officers and the legal text", () => {
    const flyer = frame("sueldo");
    moveZone(flyer, { zone: "cashback", handle: null }, 1, 2);
    expect(flyer.cfg.cashback).toMatchObject({ xc: 621, y: 1071 });
    moveZone(flyer, { zone: "asesores", handle: null }, 1, 2);
    expect(flyer.cfg.contacto).toMatchObject({ ey: 5332, y1: 5362, y3: 5420, xLeft: 311 });
    moveZone(flyer, { zone: "legal", handle: null }, 1, 2);
    expect(flyer.cfg.legal).toMatchObject({ x0: 40, yStart: 5597, yEnd: 6302 });
  });

  it("the corner of the legal text: never shorter than 30 nor narrower than 120", () => {
    const flyer = frame();
    moveZone(flyer, { zone: "legal", handle: "br" }, 10, 20);
    expect(flyer.cfg.legal).toMatchObject({ maxW: 1172, yEnd: 6320 });
    moveZone(flyer, { zone: "legal", handle: "br" }, -5000, -5000);
    expect(flyer.cfg.legal).toMatchObject({ maxW: 120, yEnd: 5625 });
  });

  it("the lines of the benefit, all together or one, which carries its shift along", () => {
    const category = frame("rubros", "Promo adicional");
    const lines = benefitLines(category);
    expect(lines.map(({ x, dx }) => [x, dx])).toEqual([
      [119, -501],
      [673, 53],
    ]);
    moveZone(category, { zone: "blAll", handle: null }, 3, 4);
    expect(lines.map(({ x, y, dx }) => [x, y, dx])).toEqual([
      [122, 2449, -501],
      [676, 2502, 53],
    ]);
    moveZone(category, { zone: "bl1", handle: null }, 7, 1);
    expect(lines[1]).toMatchObject({ x: 683, y: 2503, dx: 60 });
    delete lines[0]!.dx;
    moveZone(category, { zone: "bl0", handle: null }, 1, 1);
    expect(lines[0]).toMatchObject({ x: 123, y: 2450 });
    expect(lines[0]?.dx).toBeUndefined();
    const before = JSON.stringify(category.cfg);
    moveZone(category, { zone: "bl99", handle: null }, 1, 1);
    moveZone(category, { zone: "nada", handle: null }, 1, 1);
    expect(JSON.stringify(category.cfg)).toBe(before);
  });

  it("the arrows: one pixel, ten with Shift; anything else is not a move", () => {
    expect(arrowStep("ArrowUp", false)).toEqual([0, -1]);
    expect(arrowStep("ArrowRight", true)).toEqual([10, 0]);
    expect(arrowStep("ArrowDown", true)).toEqual([0, 10]);
    expect(arrowStep("ArrowLeft", false)).toEqual([-1, 0]);
    expect(arrowStep("Enter", false)).toBeNull();
  });
});
