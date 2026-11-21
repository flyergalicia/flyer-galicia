import { describe, expect, it } from "vitest";
import { applyBase, CALIBRATION_BASES } from "./bases.ts";
import { finalHeightOf, mergeSaved, startingCalibration } from "./calibration.ts";
import {
  propertiesOf,
  propertiesTarget,
  resetProperties,
  setBoxColor,
  setProperty,
  sixDigitColor,
  WEIGHTS,
} from "./properties.ts";

function base(id: string) {
  const found = CALIBRATION_BASES.find((one) => one.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe("the starting points", () => {
  it("are the factory one and the two of Pasá tu sueldo", () => {
    expect(CALIBRATION_BASES.map(({ nombre }) => nombre)).toEqual([
      "Flyer Galicia (de fábrica)",
      "Pasá tu sueldo: combustible",
      "Pasá tu sueldo: súper + combustible",
    ]);
  });

  it("fill the zones they know and keep the rest", () => {
    const cfg = startingCalibration();
    cfg.empresa.color = "#123456";
    cfg.benef.lineas = [];
    applyBase(cfg, base("sueldo2"));
    expect(cfg.imgH).toBe(7711);
    expect(cfg.montos.boxes[2]).toEqual({ xc: 651, ew: 240, y: 920, col: "#f5921e" });
    expect(cfg.empresa).toMatchObject({ yc: 658, color: "#123456" });
    expect(cfg.cashback.xc).toBe(620);
    expect(cfg.benef.lineas).toEqual([]);
    applyBase(cfg, base("galicia"));
    expect(cfg.imgH).toBe(6457);
    expect(cfg.empresa.yc).toBe(725);
    expect(cfg.benef.lineas).toEqual([]);
  });

  it("are copied: moving a box of one does not move it in the base", () => {
    const cfg = startingCalibration();
    applyBase(cfg, base("sueldo"));
    cfg.montos.boxes[0]!.y = 999;
    const next = startingCalibration();
    applyBase(next, base("sueldo"));
    expect(next.montos.boxes[0]?.y).toBeUndefined();
  });

  it("a zone missing in the calibration is taken whole", () => {
    const cfg = startingCalibration();
    Reflect.deleteProperty(cfg, "legal");
    applyBase(cfg, base("sueldo"));
    expect(cfg.legal).toEqual({ x0: 79, yStart: 6350, yEnd: 7360, maxW: 1085, fs: 12, lh: 16 });
  });
});

describe("what was saved for an image", () => {
  it("goes over the factory zone by zone, and the old loose title and cap are dropped", () => {
    const cfg = startingCalibration();
    mergeSaved(cfg, {
      imgH: 7000,
      empresa: { fs: 60 },
      benef: { lineas: [{ t: "x" }], titulo: { x: 1 }, tope: { x: 2 } },
      cropH: 5000,
    });
    expect(cfg).toMatchObject({ imgH: 7000, cropH: 5000 });
    expect(cfg.empresa).toMatchObject({ fs: 60, yc: 725 });
    expect(cfg.benef.lineas).toEqual([{ t: "x" }]);
    expect("titulo" in cfg.benef || "tope" in cfg.benef).toBe(false);
  });

  it("never touches what every object has", () => {
    const cfg = startingCalibration();
    mergeSaved(cfg, JSON.parse('{"__proto__":{"roto":1},"empresa":{"__proto__":{"roto":2}}}'));
    expect(Reflect.get({}, "roto")).toBeUndefined();
    expect(Reflect.get(cfg.empresa, "roto")).toBeUndefined();
    mergeSaved(cfg, null);
    mergeSaved(cfg, { benef: "nada" });
    expect(cfg.benef).toBe("nada");
  });

  it("the final height: empty or nothing positive is automatic", () => {
    expect(finalHeightOf("")).toBe(0);
    expect(finalHeightOf("-3")).toBe(0);
    expect(finalHeightOf("abc")).toBe(0);
    expect(finalHeightOf("5200")).toBe(5200);
  });
});

function labels(zone: string) {
  return propertiesOf(zone)?.fields.map(({ label }) => label);
}

describe("the size, weight and color of each zone", () => {
  it("each zone has its fields; a box its own; a line of the benefit, none here", () => {
    expect(labels("empresa")).toEqual(["Letra px", "Peso", "Color", "Ancho máx."]);
    expect(labels("montos")).toEqual(["Letra px", "Peso", "Alto caja", "Color de cada monto"]);
    expect(labels("cashback")).toEqual(["Letra px", "Peso", "Color", "Ancho máx."]);
    expect(labels("asesores")).toEqual(["Nombre px", "Cel./mail px", "Peso del nombre", "Color"]);
    expect(labels("legal")).toEqual(["Letra px", "Interlineado", "Color"]);
    expect(labels("mb2")).toEqual(["Ancho caja", "Alto caja", "Color"]);
    expect(propertiesOf("bl0")).toBeNull();
    expect(propertiesOf(null)).toBeNull();
    expect(WEIGHTS.map(({ label }) => label)).toEqual([
      "400 fina",
      "500",
      "600",
      "700",
      "800 negrita",
    ]);
  });

  it("writes a number as a number and the rest as it is typed", () => {
    const cfg = startingCalibration();
    const [size, weight, color] = propertiesOf("empresa")?.fields ?? [];
    if (!size || !weight || !color) throw new Error("fields");
    setProperty(cfg, "empresa", size, "60");
    setProperty(cfg, "empresa", weight, "400");
    setProperty(cfg, "empresa", color, "#123456");
    expect(cfg.empresa).toMatchObject({ fs: 60, peso: "400", color: "#123456" });
    setProperty(cfg, "empresa", size, "x");
    expect(cfg.empresa.fs).toBe(0);
    setProperty(cfg, "bl0", size, "9");
  });

  it("a box writes in its own place, and the group colors each one", () => {
    const cfg = startingCalibration();
    const [width] = propertiesOf("mb1")?.fields ?? [];
    if (!width) throw new Error("fields");
    setProperty(cfg, "mb1", width, "300");
    expect(cfg.montos.boxes[1]?.ew).toBe(300);
    setBoxColor(cfg, 3, "#000000");
    setBoxColor(cfg, 9, "#000000");
    expect(cfg.montos.boxes[3]?.col).toBe("#000000");
    setProperty(cfg, "mb9", width, "300");
    expect(cfg.montos.boxes).toHaveLength(4);
  });

  it("Restablecer: the values of the factory, without moving", () => {
    const cfg = startingCalibration();
    cfg.empresa.fs = 60;
    cfg.empresa.yc = 800;
    cfg.montos.boxes[0]!.col = "#000000";
    cfg.montos.fs = 10;
    cfg.montos.boxes[1]!.ew = 10;
    resetProperties(cfg, "empresa");
    resetProperties(cfg, "montos");
    resetProperties(cfg, "mb1");
    expect(cfg.empresa).toMatchObject({ fs: 46, yc: 800 });
    expect(cfg.montos).toMatchObject({ fs: 56 });
    expect(cfg.montos.boxes[0]?.col).toBe("#1d4070");
    expect(cfg.montos.boxes[1]?.ew).toBe(215);
    cfg.montos.boxes.push({ xc: 1, ew: 1, col: "#000000" });
    resetProperties(cfg, "mb4");
    resetProperties(cfg, "montos");
    expect(cfg.montos.boxes[4]?.col).toBe("#000000");
  });

  it("the object they are written in; nothing where there is none", () => {
    const cfg = startingCalibration();
    const box = propertiesOf("mb0");
    if (!box) throw new Error("box");
    expect(propertiesTarget(cfg, box)).toBe(cfg.montos.boxes[0]);
    expect(propertiesTarget({ montos: { boxes: "x" } }, box)).toBeNull();
    expect(propertiesTarget({}, box)).toBeNull();
  });

  it("a color of three digits is shown with six", () => {
    expect(sixDigitColor("#abc")).toBe("#aabbcc");
    expect(sixDigitColor(" #A1B2C3 ")).toBe("#A1B2C3");
    expect(sixDigitColor("rojo", "#111111")).toBe("#111111");
    expect(sixDigitColor(undefined)).toBe("#000000");
  });
});
