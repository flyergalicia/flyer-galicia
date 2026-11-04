import { describe, expect, it } from "vitest";
import { drawBenefit } from "./draw-benefit.ts";
import { passOn, recordingContext, textsOf } from "./testing/recording-context.ts";
import { testScene } from "./testing/test-scene.ts";
import { type BenefitLine, type FlyerValues } from "./types.ts";

function drawn(lines: Partial<BenefitLine>[], values: Partial<FlyerValues> = {}, color2?: string) {
  const recording = recordingContext();
  const scene = testScene({
    calibration: { benef: { lineas: lines, ...(color2 ? { color2 } : {}) } },
  });
  drawBenefit(passOn(recording, scene), { empresa: "X", ...values });
  return recording;
}

describe("drawBenefit", () => {
  it("draws the default lines of the fuel box, with the name and the cap", () => {
    const recording = recordingContext();
    drawBenefit(passOn(recording, testScene()), {
      empresa: "X",
      benefNombre: " ACME ",
      importe: "$24.000",
    });
    expect(textsOf(recording)).toEqual([
      "¡Beneficio exclusivo ACME!",
      "25% de ahorro",
      " en combustible",
      "Los domingos",
      "Tope de reintegro mensual $24.000 (5)",
      "Válido en todas las estaciones del país",
      "Medio de pago: Tarjeta de débito física",
    ]);
    expect(recording.texts[0]?.font).toContain("800 42px Figtree");
    expect(recording.texts[1]).toMatchObject({ color: "#fa6400" });
    expect(recording.texts[2]).toMatchObject({ color: "#000000" });
    expect(recording.texts[2]?.font).toContain("500 42px");
  });

  it("with no name, its marker goes away with its spaces, also when highlighted", () => {
    expect(textsOf(drawn([{ t: "¡Beneficio exclusivo {nombre}!" }]))).toEqual([
      "¡Beneficio exclusivo!",
    ]);
    expect(textsOf(drawn([{ t: "Además, **{nombre}** tiene promo ." }]))).toEqual([
      "Además, tiene promo.",
    ]);
  });

  it("does not write a line that needs a cap it does not have", () => {
    expect(
      textsOf(drawn([{ t: "Tope {importe}" }, { t: "Otro {importe2}" }, { t: "Queda" }])),
    ).toEqual(["Queda"]);
    expect(textsOf(drawn([{ t: "A {importe2}" }], { importe: "  " }))).toEqual([]);
    expect(textsOf(drawn([{ t: "Tope {importe} y {importe2}" }], { importe: "$1" }))).toEqual([
      "Tope $1 y $1",
    ]);
  });

  it("fills the sum of the two caps, and a dollar sign stays a dollar sign", () => {
    expect(
      textsOf(
        drawn([{ t: "{total} / {importe2} / {importe}" }], { importe: "$1", importe2: "$2" }),
      ),
    ).toEqual(["$3 / $2 / $1"]);
    expect(textsOf(drawn([{ t: "Para {nombre}" }], { benefNombre: "$' $&" }))).toEqual([
      "Para $' $&",
    ]);
  });

  it("does not write a line that is left with nothing", () => {
    expect(textsOf(drawn([{ t: "{nombre}" }, { t: "   " }]))).toEqual([]);
  });

  it("goes left-aligned or centered around its x", () => {
    const left = drawn([{ t: "Hola", x: 100, y: 200, align: "left" }]);
    expect(left.texts[0]).toMatchObject({ x: 100, y: 200, align: "left", baseline: "middle" });
    const centered = drawn([{ t: "Hola", x: 100, y: 200, align: "center" }]);
    expect(centered.texts[0]?.x).toBeLessThan(100);
  });

  it("highlighted parts follow one after the other, in the color and weight of the box", () => {
    const { texts } = drawn(
      [{ t: "A **B** C **D**", align: "left", x: 10, peso: 600 }],
      {},
      "#123456",
    );
    expect(texts.map(({ text }) => text)).toEqual(["A ", "B", " C ", "D"]);
    expect(texts[1]).toMatchObject({ color: "#123456" });
    expect(texts[1]?.font).toContain("800");
    expect(texts[0]?.font).toContain("600");
    const [a, b, c] = texts;
    expect(b?.x ?? 0).toBeGreaterThan(a?.x ?? 0);
    expect(c?.x ?? 0).toBeGreaterThan(b?.x ?? 0);
  });

  it("a line with no line height shrinks to fit in half steps, down to a minimum", () => {
    const { texts } = drawn([{ t: "Un texto que no entra en tan poco lugar", fs: 40, mw: 300 }]);
    const size = Number.parseFloat(texts[0]?.font.replace("500 ", "") ?? "");
    expect(size).toBeLessThan(40);
    expect(size * 2).toBe(Math.floor(size * 2));
    const tiny = drawn([{ t: "Un texto que no entra en tan poco lugar", fs: 40, mw: 5 }]);
    expect(tiny.texts[0]?.font).toContain("8px");
  });

  it("a line with line height wraps first, with no spaces at the ends of a row", () => {
    const { texts } = drawn(
      [
        {
          t: "Además, {nombre} tiene una promo adicional",
          x: 100,
          y: 1000,
          fs: 20,
          mw: 200,
          lh: 30,
          align: "left",
        },
      ],
      { benefNombre: "ACME" },
    );
    const rows = [...new Set(texts.map(({ y }) => y))];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows[1]! - rows[0]!).toBe(30);
    expect((rows[0]! + rows.at(-1)!) / 2).toBeCloseTo(1000, 0);
    const byRow = rows.map((y) => texts.filter((text) => text.y === y));
    for (const row of byRow) {
      expect(row[0]?.text.trim()).not.toBe("");
      expect(row.at(-1)?.text.trim()).not.toBe("");
    }
    expect(texts[0]?.font).toContain("20px");
  });

  it("shrinks a wrapped line only when wrapping is not enough", () => {
    const tooManyRows = drawn([
      { t: "uno dos tres cuatro cinco seis siete ocho", fs: 30, mw: 100, lh: 30, maxLin: 2 },
    ]);
    const size = Number.parseFloat(tooManyRows.texts[0]?.font.replace("500 ", "") ?? "");
    expect(size).toBeLessThan(30);
    const longWord = drawn([{ t: "Supercalifragilisticoespialidoso", fs: 40, mw: 5, lh: 40 }]);
    expect(longWord.texts[0]?.font).toContain("8px");
  });

  it("an empty highlight in a wrapped line draws nothing", () => {
    const { texts } = drawn([{ t: "**   **", lh: 30, fs: 20 }]);
    expect(texts).toEqual([]);
  });

  it("lines of one group shrink together", () => {
    const { texts } = drawn([
      { t: "Corto", fs: 40, mw: 800, g: "bajada" },
      { t: "Un texto bastante más largo que no entra", fs: 40, mw: 300, g: "bajada" },
      { t: "Otro", fs: 40, mw: 800 },
    ]);
    const sizes = texts.map(({ font }) => Number.parseFloat(font.replace("500 ", "")));
    expect(sizes[0]).toBe(sizes[1]);
    expect(sizes[0]).toBeLessThan(40);
    expect(sizes[2]).toBe(40);
  });

  it("a group that fits stays at its size", () => {
    const { texts } = drawn([
      { t: "Uno", fs: 40, g: "g" },
      { t: "Dos", fs: 40, g: "g" },
    ]);
    expect(texts.map(({ font }) => font)).toEqual([
      expect.stringContaining("40px"),
      expect.stringContaining("40px"),
    ]);
  });

  it("uses the regular weight and a dark color by default", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { benef: { lineas: [{ t: "A", color: "" }] } } });
    drawBenefit(passOn(recording, scene), { empresa: "X" });
    expect(recording.texts[0]).toMatchObject({ color: "#000000" });
  });
});
