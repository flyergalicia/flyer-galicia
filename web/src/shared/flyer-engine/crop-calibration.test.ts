import { describe, expect, it } from "vitest";
import { resolveCalibration } from "./calibration.ts";
import { cropCalibration } from "./crop-calibration.ts";
import { type RawCalibration } from "./types.ts";

// Image and reference share their size here: one calibration pixel is one pixel of the picture.
const WIDTH = 1240;
const HEIGHT = 6457;
const RAW: RawCalibration = {
  empresa: { yc: 700 },
  montos: {
    y: 1000,
    boxes: [
      { xc: 100, ew: 100, col: "#000" },
      { xc: 300, ew: 100, col: "#000", y: 1100 },
    ],
  },
  cashback: { y: 1000 },
  contacto: { ey: 5330, y1: 5360, y2: 5390, y3: 5418 },
  legal: { yStart: 5595, yEnd: 6300 },
  benef: {
    lineas: [
      { t: "arriba", y: 500 },
      { t: "abajo", y: 3000 },
    ],
  },
};

function crop(raw: RawCalibration, cuts: Parameters<typeof cropCalibration>[1]) {
  return cropCalibration(raw, cuts, WIDTH, HEIGHT);
}

describe("cropping", () => {
  it("what is above the cut stays, and what is below goes up", () => {
    const calibration = crop(RAW, [{ y: 2000, h: 300 }]);
    expect(calibration.empresa.yc).toBe(700);
    expect(calibration.montos.y).toBe(1000);
    expect(calibration.benef.lineas.map(({ t, y }) => [t, y])).toEqual([
      ["arriba", 500],
      ["abajo", 2700],
    ]);
  });

  it("what falls inside the cut is turned off", () => {
    const calibration = crop(RAW, [{ y: 650, h: 600 }]);
    expect(calibration.empresa.off).toBe(true);
    expect(calibration.montos.off).toBe(true);
    expect(calibration.cashback.off).toBe(true);
    expect(calibration.empresa.yc).toBe(700);
  });

  it("each zone turns off by itself: what is not inside the cut stays on", () => {
    const flat: RawCalibration = {
      empresa: { yc: 700 },
      montos: { y: 1000, boxes: [{ xc: 100, ew: 100, col: "#000" }] },
      cashback: { y: 2000 },
    };
    const amounts = crop(flat, [{ y: 900, h: 200 }]);
    expect(amounts.montos.off).toBe(true);
    expect(amounts.empresa.off).toBeUndefined();
    expect(amounts.cashback.off).toBeUndefined();
    const single = crop(flat, [{ y: 1900, h: 200 }]);
    expect(single.cashback.off).toBe(true);
    expect(single.montos.off).toBeUndefined();
  });

  it("the edges count: the top of a cut is inside and its bottom is outside", () => {
    expect(crop(RAW, [{ y: 700, h: 10 }]).empresa.off).toBe(true);
    const below = crop(RAW, [{ y: 600, h: 100 }]);
    expect(below.empresa.off).toBeUndefined();
    expect(below.empresa.yc).toBe(600);
  });

  it("one box inside the cut turns the whole band off, and the others follow", () => {
    const calibration = crop(RAW, [{ y: 1050, h: 100 }]);
    expect(calibration.montos.off).toBe(true);
    const above = crop(RAW, [{ y: 200, h: 100 }]);
    expect(above.montos.off).toBeUndefined();
    expect(above.montos.boxes[1]?.y).toBe(1000);
    expect(above.montos.boxes[0]?.y).toBeUndefined();
  });

  it("what is anchored at the bottom makes up for a cut below it, and not for one above it", () => {
    const below = crop(RAW, [{ y: 6000, h: 100 }]);
    // The picture is shorter and the anchor is counted from its end: it must not move on the page.
    expect(below.contacto.ey).toBe(5430);
    const above = crop(RAW, [{ y: 2000, h: 100 }]);
    expect(above.contacto).toMatchObject({ ey: 5330, y1: 5360, y2: 5390, y3: 5418 });
    expect(above.legal).toMatchObject({ yStart: 5595, yEnd: 6300 });
  });

  it("what is anchored at the bottom and falls inside the cut goes to its edge", () => {
    const { contacto } = crop(RAW, [{ y: 5300, h: 100 }]);
    expect(contacto.ey).toBe(HEIGHT - (HEIGHT - 100 - 5300));
  });

  it("each cut is measured on what the one before left", () => {
    const { empresa, contacto } = crop(RAW, [
      { y: 100, h: 100 },
      { y: 200, h: 100 },
    ]);
    expect(empresa.yc).toBe(500);
    expect(contacto.ey).toBe(5330);
  });

  it("a cut with no benefit lines left does not bring the default ones back", () => {
    const { lineas } = crop({ benef: { lineas: [{ t: "sola", y: 100 }] } }, [
      { y: 50, h: 100 },
    ]).benef;
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ t: "", y: -9999, mw: 10 });
  });

  it("shortens a height fixed by hand, down to one pixel", () => {
    expect(crop({ cropH: 5000 }, [{ y: 100, h: 300 }]).cropH).toBe(4700);
    expect(crop({ cropH: 200 }, [{ y: 100, h: 300 }]).cropH).toBe(1);
    expect(crop({}, [{ y: 100, h: 300 }]).cropH).toBe(0);
  });
});

describe("inserting a section", () => {
  const section = { u: "https://flyers.invalid/s.jpg", sy: 0, sh: 100 };

  it("what is at the top and below it goes down, and nothing is turned off", () => {
    const calibration = crop(RAW, [{ y: 650, h: 300, ins: section }]);
    expect(calibration.empresa.yc).toBe(1000);
    expect(calibration.empresa.off).toBeUndefined();
    expect(calibration.montos.y).toBe(1300);
    expect(crop(RAW, [{ y: 800, h: 300, ins: section }]).empresa.yc).toBe(700);
  });

  it("what is at the bottom makes up only if it stays above the section", () => {
    expect(crop(RAW, [{ y: 6000, h: 300, ins: section }]).contacto.ey).toBe(5030);
    expect(crop(RAW, [{ y: 100, h: 300, ins: section }]).contacto.ey).toBe(5330);
  });

  it("grows a height fixed by hand", () => {
    expect(crop({ cropH: 5000 }, [{ y: 100, h: 300, ins: section }]).cropH).toBe(5300);
  });
});

describe("the copy", () => {
  it("never touches the original nor the defaults", () => {
    const raw: RawCalibration = { montos: { boxes: [{ xc: 1, ew: 1, col: "#000", y: 1000 }] } };
    crop(raw, [{ y: 10, h: 100 }]);
    expect(raw.montos?.boxes?.[0]?.y).toBe(1000);
    crop({ montos: { y: 2000 } }, [{ y: 10, h: 100 }]);
    expect(resolveCalibration().montos.boxes[0]?.y).toBeUndefined();
    expect(resolveCalibration().empresa.yc).toBe(725);
  });

  it("scales the cut when the picture is not the size of the reference", () => {
    const { empresa } = cropCalibration(RAW, [{ y: 200, h: 200 }], WIDTH * 2, HEIGHT * 2);
    expect(empresa.yc).toBe(600);
  });
});
