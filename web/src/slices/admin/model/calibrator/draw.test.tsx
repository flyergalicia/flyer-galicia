import { describe, expect, it } from "vitest";
import { startingCalibration } from "./calibration.ts";
import { type CalibratorSource, createCalibratorStore } from "./calibrator-store.ts";
import { drawCalibrator, sampleValues } from "./draw.ts";

function whiteFlyer(height = 6457): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1240, height);
  return canvas;
}

function storeOf(source: Partial<CalibratorSource> = {}) {
  return createCalibratorStore(
    {
      image: whiteFlyer(),
      name: "flyer_1_op9.jpg",
      url: "u",
      option: 9,
      optionName: "Combustible",
      tab: "flyer",
      ...source,
    },
    startingCalibration(),
    1366,
  );
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): string {
  const data = canvas.getContext("2d")?.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return data ? Array.from(data.slice(0, 3)).join(",") : "";
}

/** Whether the frame of a zone is on the canvas: its top border, in its color. */
function hasFrame(canvas: HTMLCanvasElement, scale: number, rect: { x: number; y: number }) {
  return pixel(canvas, (rect.x + 200) * scale, rect.y * scale);
}

describe("what the calibrator draws", () => {
  it("the flyer at its scale, with the frame of every zone", () => {
    const store = storeOf();
    const canvas = document.createElement("canvas");
    drawCalibrator(canvas, store);
    const scale = store.scale();
    expect(canvas.width).toBe(Math.round(1240 * scale));
    expect(canvas.height).toBe(Math.round(6457 * scale));
    expect(canvas.style.width).toBe(`${String(canvas.width)}px`);
    expect(hasFrame(canvas, scale, { x: 70, y: 673 })).not.toBe("255,255,255");
    expect(hasFrame(canvas, scale, { x: 39, y: 5595 })).not.toBe("255,255,255");
  });

  it("with a zone chosen, only that one", () => {
    const store = storeOf();
    store.choose("legal");
    const canvas = document.createElement("canvas");
    drawCalibrator(canvas, store);
    const scale = store.scale();
    expect(hasFrame(canvas, scale, { x: 39, y: 5595 })).not.toBe("255,255,255");
    expect(hasFrame(canvas, scale, { x: 70, y: 673 })).toBe("255,255,255");
  });

  it("grays what is cut below the legal text, unless the height is chosen past the picture", () => {
    const store = storeOf();
    const canvas = document.createElement("canvas");
    drawCalibrator(canvas, store);
    const bottom = canvas.height - 2;
    expect(pixel(canvas, 5, bottom)).not.toBe("255,255,255");
    store.setHeight("9000");
    drawCalibrator(canvas, store);
    expect(pixel(canvas, 5, bottom)).toBe("255,255,255");
  });

  it("a flyer that cannot be drawn still shows its zones, with no cut", () => {
    const broken = whiteFlyer();
    broken.width = 0;
    const store = storeOf({ image: broken });
    const canvas = document.createElement("canvas");
    drawCalibrator(canvas, store);
    const scale = store.scale();
    expect(hasFrame(canvas, scale, { x: 70, y: 673 })).not.toBe("0,0,0");
    expect(pixel(canvas, 5, canvas.height - 2)).toBe("0,0,0");
  });

  it("the example data of each tab", () => {
    expect(sampleValues(storeOf())).toMatchObject({ benef: false, importe: "", cashUnico: false });
    const category = storeOf({ tab: "rubros" });
    category.setLegalText("Legal real");
    expect(sampleValues(category)).toMatchObject({
      benef: true,
      benefNombre: "EMPRESA EJEMPLO",
      importe: "$24.000",
      importe2: "$30.000",
      legal: "Legal real",
    });
    expect(sampleValues(storeOf({ tab: "sueldo" })).cashUnico).toBe(true);
    expect(sampleValues(storeOf()).legal).toMatch(/^Ejemplo de términos/);
  });
});
