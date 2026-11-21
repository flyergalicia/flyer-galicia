import { describe, expect, it } from "vitest";
import {
  addLine,
  benefitLines,
  type BenefitBox,
  blockOf,
  centerLines,
  editLine,
  estimatedWidth,
  linesOfTemplate,
  templateForName,
  templateOf,
} from "./benefit.ts";
import { startingCalibration } from "./calibration.ts";

const BOX: BenefitBox = {
  top: 2500,
  bottom: 2800,
  left: 100,
  right: 1140,
  textoX0: 400,
  textoX1: 1100,
  cx: 750,
  cy: 2650,
};

describe("the template a flyer starts with", () => {
  it("goes by the name of the option", () => {
    expect(templateForName("Combustible")).toBe("combustible");
    expect(templateForName("Súper")).toBe("supermercado");
    expect(templateForName("Supermercado del barrio")).toBe("supermercado");
    expect(templateForName("Ambos")).toBe("ambos");
    expect(templateForName("Combustible y súper")).toBe("ambos");
    expect(templateForName("Promo adicional")).toBe("adicional");
    expect(templateForName("Rubro")).toBe("combustible");
    expect(templateForName("")).toBe("combustible");
  });

  it("an unknown template is the first one", () => {
    expect(templateOf("nada").nombre).toBe("Combustible");
    expect(templateOf("adicional").fijo).toBe(true);
  });

  it("its lines come whole, and the labels of its caps go to the calibration", () => {
    const cfg = startingCalibration();
    const lines = linesOfTemplate(cfg, "adicional2");
    expect(lines[0]).toMatchObject({ t: "Tope de reintegro mensual {importe2}", g: "t", dx: -341 });
    expect(cfg.benef.campos).toEqual({
      importe: "Tope supermercado",
      importe2: "Tope combustible (si es distinto)",
    });
    linesOfTemplate(cfg, "combustible");
    expect(cfg.benef.campos).toEqual({
      importe: "Tope de reintegro mensual",
      importe2: "Segundo tope (si es distinto)",
    });
  });

  it("with no lines saved they start with the template of the option, once", () => {
    const cfg = startingCalibration();
    const lines = benefitLines({ cfg, optionName: "Supermercado" });
    expect(lines[1]?.t).toBe("**25% de ahorro** en Supermercados");
    expect(benefitLines({ cfg, optionName: "Combustible" })).toBe(lines);
  });
});

describe("centering the block", () => {
  it("estimates the width of a line by its letters, between 40 and its widest", () => {
    const line = { ...linesOfTemplate(startingCalibration(), "combustible")[2]! };
    expect(estimatedWidth(line)).toBe(Math.round("Los domingos".length * 21 * 0.55));
    expect(estimatedWidth({ ...line, t: "" })).toBe(40);
    expect(estimatedWidth({ ...line, t: "x".repeat(200) })).toBe(800);
    expect(estimatedWidth({ ...line, t: "{nombre}", mw: 0 })).toBe(
      Math.round("EMPRESA EJEMPLO".length * 21 * 0.55),
    );
  });

  it("puts every line on the axis of the box and the block in its middle, shrinking if it does not fit", () => {
    const lines = linesOfTemplate(startingCalibration(), "combustible");
    const asked: number[] = [];
    const box = centerLines(lines, (middle) => {
      asked.push(middle);
      return BOX;
    });
    expect(box).toBe(BOX);
    expect(asked[0]).toBeCloseTo((2630 - 21 + 2827 + 8) / 2);
    expect(lines.every(({ x, align }) => x === 750 && align === "center")).toBe(true);
    const { top, bottom } = blockOf(lines);
    expect((top + bottom) / 2).toBeCloseTo(2650, -1);
    expect(lines[0]?.fs).toBeLessThanOrEqual(42);
    expect(lines[0]?.mw).toBe(680);
  });

  it("a tall block shrinks its gaps and its letters, never below 6", () => {
    const lines = linesOfTemplate(startingCalibration(), "combustible");
    centerLines(lines, () => ({ ...BOX, top: 2600, bottom: 2640 }));
    expect(lines.map(({ fs }) => fs)).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it("a line of a column keeps its shift from the axis", () => {
    const lines = linesOfTemplate(startingCalibration(), "ambos");
    centerLines(lines, () => BOX);
    expect(lines[2]).toMatchObject({ x: 750 - 352, align: "left" });
    expect(lines[0]).toMatchObject({ x: 750, align: "center" });
  });

  it("without a box the lines go on one same axis, where they were", () => {
    const lines = linesOfTemplate(startingCalibration(), "combustible");
    lines[0]!.x = 700;
    lines[1]!.align = "left";
    expect(centerLines(lines, () => null)).toBeNull();
    const axis = lines[0]?.x;
    expect(lines.every(({ x }) => x === axis)).toBe(true);
    expect(lines[0]?.fs).toBe(42);
    expect(centerLines([], () => BOX)).toBeNull();
  });
});

describe("editing a line", () => {
  it("takes what makes sense and says so", () => {
    const [line] = linesOfTemplate(startingCalibration(), "combustible");
    if (!line) throw new Error("no line");
    expect(editLine(line, "t", "Hola {nombre}")).toBe(true);
    expect(editLine(line, "fs", "5")).toBe(false);
    expect(editLine(line, "fs", "18.5")).toBe(true);
    expect(editLine(line, "peso", "99")).toBe(false);
    expect(editLine(line, "peso", "600")).toBe(true);
    expect(editLine(line, "color", "rojo")).toBe(false);
    expect(editLine(line, "color", "#ABCDEF")).toBe(true);
    expect(editLine(line, "align", "left")).toBe(true);
    expect(line).toMatchObject({
      t: "Hola {nombre}",
      fs: 18.5,
      peso: 600,
      color: "#abcdef",
      align: "left",
    });
    editLine(line, "align", "derecha");
    expect(line.align).toBe("center");
  });

  it("a new line goes under the last one, or at the default place if there is none", () => {
    const lines = linesOfTemplate(startingCalibration(), "combustible");
    addLine(lines);
    expect(lines.at(-1)).toMatchObject({ t: "Nueva línea", x: 723, y: 2851, fs: 16 });
    const none: typeof lines = [];
    addLine(none);
    expect(none[0]).toMatchObject({ x: 640, y: 2724, fs: 14.5, align: "center", mw: 820 });
  });
});
