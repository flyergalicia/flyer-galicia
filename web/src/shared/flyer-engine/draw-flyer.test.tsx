import { describe, expect, it } from "vitest";
import { contextOf, createCanvas } from "./canvas.ts";
import { drawFlyer } from "./draw-flyer.ts";
import { recordingContext, textsOf } from "./testing/recording-context.ts";
import { NO_LOGOS, paintedCanvas, pixelAt, TEST_ART_KEY, testScene } from "./testing/test-scene.ts";
import { type FlyerValues, type LogoSource } from "./types.ts";

const VALUES: FlyerValues = {
  empresa: "ACME",
  m1: "$4",
  m2: "$3",
  m3: "$2",
  m4: "$1",
  legal: "Legal de {empresa}",
  has1: true,
  nombre: "Ana",
};

function fourOfficers(): FlyerValues {
  return {
    ...VALUES,
    has2: true,
    nombre2: "Luis",
    has3: true,
    nombre3: "Sara",
    has4: true,
    nombre4: "Juan",
  };
}

function showsFourAmounts(values: FlyerValues, singleCashback: boolean): boolean {
  const recording = recordingContext();
  drawFlyer(recording.ctx, { scene: testScene({ singleCashback }), values, scale: 1 }, NO_LOGOS);
  return textsOf(recording).includes("$3");
}

function showsBenefit(values: FlyerValues): boolean {
  const recording = recordingContext();
  drawFlyer(recording.ctx, { scene: testScene(), values, scale: 1 }, NO_LOGOS);
  return textsOf(recording).some((text) => text.includes("Beneficio"));
}

function grownCanvas(scale = 1) {
  const art = paintedCanvas(1240, 6457, "#ffffff");
  const ctx = contextOf(art);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(0, 0, 1240, 5329);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(0, 5329, 1240, 1);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 5330, 1240, 1127);
  const canvas = createCanvas(Math.round(1240 * scale), Math.round((6457 + 130) * scale));
  const drawn = drawFlyer(
    contextOf(canvas),
    { scene: testScene({ art }), values: { ...fourOfficers(), legal: "" }, scale },
    NO_LOGOS,
  );
  return { canvas, drawn };
}

describe("drawFlyer", () => {
  it("draws the art and everything over it", () => {
    const recording = recordingContext();
    const scene = testScene();
    const drawn = drawFlyer(recording.ctx, { scene, values: VALUES, scale: 1 }, NO_LOGOS);
    expect(recording.images[0]).toEqual([scene.art, 0, 0, 1240, 6457]);
    expect(textsOf(recording)).toEqual([
      "Por ser parte de ACME",
      "$4",
      "$3",
      "$2",
      "$1",
      "Ana",
      "Legal ",
      "de ",
      "ACME",
    ]);
    expect(drawn).toEqual({ extra: 0, contentBottom: 5595 + 17 });
  });

  it("the end of the content is that of the officers if the legal text is above them", () => {
    const recording = recordingContext();
    const drawn = drawFlyer(
      recording.ctx,
      {
        scene: testScene({ calibration: { legal: { yStart: 100, yEnd: 200 } } }),
        values: VALUES,
        scale: 1,
      },
      NO_LOGOS,
    );
    expect(drawn.contentBottom).toBe(5460);
  });

  it("the end of the content is in base pixels, at any scale", () => {
    const recording = recordingContext();
    const scene = testScene();
    expect(
      drawFlyer(recording.ctx, { scene, values: VALUES, scale: 0.5 }, NO_LOGOS).contentBottom,
    ).toBeCloseTo(5612, -1);
    expect(
      drawFlyer(recording.ctx, { scene, values: VALUES, scale: 0 }, NO_LOGOS).contentBottom,
    ).toBe(0);
  });

  it("the logos go over the art and under the company", () => {
    const logo = paintedCanvas(4, 4, "#ff0000");
    const logos: LogoSource = { ...NO_LOGOS, imageFor: () => logo };
    const recording = recordingContext();
    const change = { x: 1, y: 1, w: 1, h: 1, bg: "#fff", tx: 1, ty: 1, tw: 1, th: 1, img: "a" };
    drawFlyer(
      recording.ctx,
      {
        scene: testScene(),
        values: { ...VALUES, logos: [change], logosSrc: TEST_ART_KEY },
        scale: 1,
      },
      logos,
    );
    expect(recording.images[1]?.[0]).toBe(logo);
    expect(recording.boxes[0]).toMatchObject({ x: 1, y: 1 });
    expect(recording.boxes[1]).toMatchObject({ x: 70 });
  });

  it("a saved value says one amount or four; with none, the tab of the flyer decides", () => {
    expect(showsFourAmounts(VALUES, false)).toBe(true);
    expect(showsFourAmounts(VALUES, true)).toBe(false);
    expect(showsFourAmounts({ ...VALUES, cashUnico: null }, true)).toBe(false);
    expect(showsFourAmounts({ ...VALUES, cashUnico: false }, true)).toBe(true);
    expect(showsFourAmounts({ ...VALUES, cashUnico: true }, false)).toBe(false);
  });

  it("draws the benefit box only if the values ask for it", () => {
    expect(showsBenefit(VALUES)).toBe(false);
    expect(showsBenefit({ ...VALUES, benef: true })).toBe(true);
  });

  it("with no legal text, the end is that of the officers", () => {
    const recording = recordingContext();
    const { contentBottom } = drawFlyer(
      recording.ctx,
      { scene: testScene(), values: { ...VALUES, legal: "" }, scale: 1 },
      NO_LOGOS,
    );
    expect(contentBottom).toBe(5460);
  });

  describe("with four officers the flyer grows", () => {
    it("opens a gap with the last row above the cut, and what is below goes down", () => {
      const { canvas, drawn } = grownCanvas();
      expect(drawn.extra).toBe(130);
      expect(pixelAt(canvas, 5, 100)).toEqual([0, 255, 0, 255]);
      // The stretched row fills the gap, and the art goes on below it.
      expect(pixelAt(canvas, 5, 5400)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(canvas, 5, 6500)).toEqual([255, 0, 0, 255]);
      expect(canvas.height).toBe(6587);
    });

    it("the block of officers stays at the anchor, with the art below it moved", () => {
      const recording = recordingContext();
      const scene = testScene();
      const { contentBottom } = drawFlyer(
        recording.ctx,
        { scene, values: { ...fourOfficers(), legal: "" }, scale: 1 },
        NO_LOGOS,
      );
      expect(recording.images.map((args) => args.slice(1))).toEqual([
        [0, 0, 1240, 5330, 0, 0, 1240, 5330],
        [0, 5329, 1240, 1, 0, 5330, 1240, 131],
        [0, 5330, 1240, 1127, 0, 5460, 1240, 1127],
      ]);
      expect(recording.boxes.find(({ x }) => x === 150)).toMatchObject({ y: 5330, height: 260 });
      expect(contentBottom).toBe(5590);
    });

    it("the cut stays inside the picture", () => {
      const recording = recordingContext();
      const scene = testScene({
        art: paintedCanvas(1240, 10),
        calibration: { imgW: 1240, imgH: 6457, contacto: { ey: 99_999 } },
      });
      drawFlyer(recording.ctx, { scene, values: fourOfficers(), scale: 1 }, NO_LOGOS);
      expect(recording.images[0]?.slice(1, 5)).toEqual([0, 0, 1240, 9]);
      const top = recordingContext();
      const low = testScene({
        art: paintedCanvas(1240, 10),
        calibration: { contacto: { ey: 0, bg: "" } },
      });
      drawFlyer(top.ctx, { scene: low, values: fourOfficers(), scale: 1 }, NO_LOGOS);
      expect(top.images[0]?.slice(1, 5)).toEqual([0, 0, 1240, 1]);
      expect(top.boxes[0]).toMatchObject({ color: "#ffffff" });
    });

    it("scales the gap with the target", () => {
      const { canvas } = grownCanvas(0.5);
      expect(canvas.width).toBe(620);
      expect(pixelAt(canvas, 5, 2700)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(canvas, 5, 3200)).toEqual([255, 0, 0, 255]);
    });
  });
});
