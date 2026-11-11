import { describe, expect, it } from "vitest";
import { drawCompany } from "./draw-company.ts";
import { passOn, recordingContext } from "./testing/recording-context.ts";
import { paintedCanvas, testScene } from "./testing/test-scene.ts";

const ZONE = {
  xc: 620,
  yc: 725,
  lh: 52,
  mw: 1100,
  fs: 46,
  ex: 70,
  bg: "#f7f2ef",
  color: "#111111",
  peso: 700,
};

describe("drawCompany", () => {
  it("says it in one line when it fits, over the real color of the flyer", () => {
    const recording = recordingContext();
    const scene = testScene({ art: paintedCanvas(1240, 6457, "#102030") });
    drawCompany(passOn(recording, scene), "ACME");
    expect(recording.texts).toEqual([
      expect.objectContaining({
        text: "Por ser parte de ACME",
        x: 620,
        y: 725,
        font: "bold 46px Arial, sans-serif",
        align: "center",
        baseline: "middle",
      }),
    ]);
    expect(recording.boxes).toEqual([
      { x: 70, y: 673, width: 1100, height: 112, color: "#102030" },
    ]);
  });

  it("goes to two lines when it does not fit", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { empresa: { ...ZONE, mw: 600 } } });
    drawCompany(passOn(recording, scene), "ALIMENTOS DEL SUR SA");
    expect(recording.texts.map(({ text, y }) => [text, y])).toEqual([
      ["Por ser parte de", 699],
      ["ALIMENTOS DEL SUR SA", 751],
    ]);
    expect(recording.texts[1]?.font).toContain("46px");
  });

  it("shrinks a company that does not fit by itself either", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { empresa: { ...ZONE, mw: 300 } } });
    drawCompany(passOn(recording, scene), "UNA EMPRESA CON UN NOMBRE MUY LARGO SA");
    const [lead, company] = recording.texts;
    expect(lead?.font).toContain("46px");
    expect(Number.parseInt(company?.font.replace("bold ", "") ?? "", 10)).toBeLessThan(46);
  });

  it("scales everything with the target", () => {
    const recording = recordingContext();
    drawCompany(passOn(recording, testScene(), { scale: 0.5 }), "ACME");
    expect(recording.texts[0]).toMatchObject({ x: 310, y: 363 });
    expect(recording.texts[0]?.font).toContain("23px");
  });

  it("draws nothing once its zone was cropped", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { empresa: { off: true } } });
    drawCompany(passOn(recording, scene), "ACME");
    expect(recording.texts).toEqual([]);
    expect(recording.boxes).toEqual([]);
  });

  it("uses a dark color and bold by default", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { empresa: { color: "", peso: null } } });
    drawCompany(passOn(recording, scene), "ACME");
    expect(recording.texts[0]).toMatchObject({ color: "#111111" });
    expect(recording.texts[0]?.font).toContain("bold");
  });
});
