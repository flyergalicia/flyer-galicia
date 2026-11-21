import { describe, expect, it } from "vitest";
import { contextOf } from "./canvas.ts";
import { drawAmounts, drawCashback } from "./draw-amounts.ts";
import { passOn, recordingContext, textsOf } from "./testing/recording-context.ts";
import { paintedCanvas, testScene } from "./testing/test-scene.ts";

const VALUES = { empresa: "X", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" };

describe("drawAmounts", () => {
  it("writes the four boxes in their colors, over the real color of the flyer", () => {
    const recording = recordingContext();
    const scene = testScene({ art: paintedCanvas(1240, 6457, "#102030") });
    drawAmounts(passOn(recording, scene), VALUES);
    expect(textsOf(recording)).toEqual(["$250.000", "$180.000", "$80.000", "$30.000"]);
    expect(recording.texts.map(({ color }) => color)).toEqual([
      "#1d4070",
      "#1d4070",
      "#f5921e",
      "#f5921e",
    ]);
    expect(recording.texts[0]).toMatchObject({
      x: 224,
      y: 1069,
      align: "center",
      baseline: "middle",
    });
    expect(recording.boxes[0]).toEqual({
      x: 114,
      y: 1040,
      width: 220,
      height: 58,
      color: "#102030",
    });
  });

  it("covers the zone sin cashback and writes no number", () => {
    const recording = recordingContext();
    drawAmounts(passOn(recording, testScene()), { ...VALUES, nocb: true });
    expect(recording.boxes).toHaveLength(4);
    expect(textsOf(recording)).toEqual(["", "", "", ""]);
  });

  it("each box can have its own place and height", () => {
    const recording = recordingContext();
    const scene = testScene({
      calibration: {
        montos: {
          boxes: [
            { xc: 100, ew: 100, col: "#000000", y: 500, mh: 40 },
            { xc: 300, ew: 100, col: "#000000" },
          ],
        },
      },
    });
    drawAmounts(passOn(recording, scene), VALUES);
    expect(recording.boxes.map(({ y, height }) => [y, height])).toEqual([
      [480, 40],
      [1040, 58],
    ]);
    expect(recording.texts.map(({ y }) => y)).toEqual([500, 1069]);
  });

  it("samples every color before painting, so a lower box does not take the upper one", () => {
    const art = paintedCanvas(1240, 6457, "#102030");
    const recording = recordingContext();
    const scene = testScene({
      art,
      calibration: {
        montos: {
          y: 1000,
          bg: "#000000",
          boxes: [
            { xc: 100, ew: 100, col: "#111111", y: 1000 },
            { xc: 100, ew: 100, col: "#222222", y: 1040 },
          ],
        },
      },
    });
    drawAmounts(passOn({ ctx: contextOf(art) }, scene), VALUES);
    drawAmounts(passOn(recording, scene), VALUES);
    expect(recording.boxes[1]?.color).toBe("#102030");
  });

  it("draws nothing once its band was cropped", () => {
    const recording = recordingContext();
    drawAmounts(passOn(recording, testScene({ calibration: { montos: { off: true } } })), VALUES);
    expect(recording.boxes).toEqual([]);
  });

  it("as the old app, an absent amount says so on the flyer", () => {
    const recording = recordingContext();
    drawAmounts(passOn(recording, testScene()), { empresa: "X", m1: "$1", m2: null });
    expect(textsOf(recording)).toEqual(["$1", "null", "undefined", "undefined"]);
  });
});

describe("drawCashback", () => {
  it("writes the largest one in orange, over the real color", () => {
    const recording = recordingContext();
    const scene = testScene({ art: paintedCanvas(1240, 6457, "#102030") });
    drawCashback(passOn(recording, scene), VALUES);
    expect(recording.texts).toEqual([
      expect.objectContaining({ text: "$250.000", x: 620, y: 1069, color: "#fa6400" }),
    ]);
    expect(recording.texts[0]?.font).toContain("92px");
    expect(recording.boxes[0]).toEqual({
      x: 340,
      y: 1029,
      width: 560,
      height: 80,
      color: "#102030",
    });
  });

  it("covers the zone and writes nothing sin cashback", () => {
    const recording = recordingContext();
    drawCashback(passOn(recording, testScene()), { ...VALUES, nocb: true });
    expect(recording.boxes).toHaveLength(1);
    expect(recording.texts).toEqual([]);
  });

  it("shrinks an amount that does not fit, down to a minimum", () => {
    const fits = recordingContext();
    drawCashback(passOn(fits, testScene({ calibration: { cashback: { mw: 200 } } })), VALUES);
    const size = Number.parseInt(fits.texts[0]?.font.replace("bold ", "") ?? "", 10);
    expect(size).toBeLessThan(92);
    expect(size).toBeGreaterThan(28);
    const tiny = recordingContext();
    drawCashback(
      passOn(tiny, testScene({ calibration: { cashback: { mw: 10, minFs: 0, col: "" } } })),
      VALUES,
    );
    expect(tiny.texts[0]?.font).toContain("28px");
    expect(tiny.texts[0]?.color).toBe("#fa6400");
  });

  it("draws nothing once its zone was cropped", () => {
    const recording = recordingContext();
    drawCashback(
      passOn(recording, testScene({ calibration: { cashback: { off: true } } })),
      VALUES,
    );
    expect(recording.boxes).toEqual([]);
  });
});
