import { describe, expect, it } from "vitest";
import { mergeZone, resolveCalibration } from "./calibration.ts";

describe("resolveCalibration", () => {
  it("gives a flyer with no calibration the default one", () => {
    const calibration = resolveCalibration(null);
    expect(calibration.imgW).toBe(1240);
    expect(calibration.imgH).toBe(6457);
    expect(calibration.cropH).toBe(0);
    expect(calibration.recDe).toBe(0);
    expect(calibration.bottomMargin).toBe(45);
    expect(calibration.empresa.yc).toBe(725);
    expect(calibration.montos.boxes).toHaveLength(4);
    expect(calibration.contacto.ey).toBe(5330);
    expect(calibration.legal.yEnd).toBe(6300);
    expect(calibration.benef.color2).toBe("#fa6400");
    expect(calibration.benef.peso2).toBe(800);
    expect(calibration.benef.lineas[0]?.t).toBe("¡Beneficio exclusivo {nombre}!");
    expect(calibration.benef.lineas[3]?.align).toBe("center");
    expect(calibration.benef.campos).toEqual({
      importe: "Tope de reintegro mensual",
      importe2: "Segundo tope (si es distinto)",
    });
  });

  it("takes what is stored and keeps the default of what is not", () => {
    const calibration = resolveCalibration({
      imgW: 2000,
      imgH: 7000,
      recDe: 3,
      cropH: 5000,
      bottomMargin: 0,
      empresa: { yc: 100 },
      legal: { fs: 20 },
      benef: { color2: "#000", peso2: 500, campos: { importe: "Otro" } },
    });
    expect(calibration.imgW).toBe(2000);
    expect(calibration.imgH).toBe(7000);
    expect(calibration.recDe).toBe(3);
    expect(calibration.cropH).toBe(5000);
    expect(calibration.bottomMargin).toBe(0);
    expect(calibration.empresa).toMatchObject({ yc: 100, xc: 620 });
    expect(calibration.legal).toMatchObject({ fs: 20, lh: 17 });
    expect(calibration.benef.color2).toBe("#000");
    expect(calibration.benef.peso2).toBe(500);
    expect(calibration.benef.campos).toMatchObject({
      importe: "Otro",
      importe2: "Segundo tope (si es distinto)",
    });
  });

  it("a null keeps the default", () => {
    expect(resolveCalibration({ bottomMargin: null }).bottomMargin).toBe(45);
    const stored: { a?: number | null } = { a: null };
    expect(mergeZone<{ a?: number | null; b?: number }>({ a: 1, b: 2 }, stored)).toEqual({
      a: 1,
      b: 2,
    });
    expect(mergeZone({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("completes each stored line of the benefit box", () => {
    const [first, second] = resolveCalibration({
      benef: {
        lineas: [
          { t: "A", fs: 0, peso: 50 },
          { t: "B", fs: 30, peso: 700, align: "left" },
        ],
      },
    }).benef.lineas;
    expect(first).toMatchObject({ t: "A", fs: 17, peso: 500, mw: 820, align: "center" });
    expect(second).toMatchObject({ t: "B", fs: 30, peso: 700, align: "left" });
  });

  it("reads the two loose parts a calibration of the previous version saved", () => {
    const part = { x: 1, y: 2, mw: 3 };
    const { lineas } = resolveCalibration({
      benef: { titulo: { ...part, fs: 40, color: "#111" }, tope: { ...part, color: "#222" } },
    }).benef;
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({
      t: "¡Beneficio exclusivo {nombre}!",
      fs: 40,
      peso: 800,
      align: "left",
      color: "#111",
    });
    expect(lineas[1]).toMatchObject({
      t: "Tope de reintegro mensual {importe}",
      fs: 16.5,
      peso: 500,
      align: "center",
      color: "#222",
    });
  });

  it("respects the words of those old parts, and either one alone", () => {
    const { lineas } = resolveCalibration({
      benef: { titulo: { x: 1, y: 2, mw: 3, pre: "Hola ", post: ".", align: "center" } },
    }).benef;
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ t: "Hola {nombre}.", align: "center", color: "#000000" });
    const capOnly = resolveCalibration({
      benef: { tope: { x: 1, y: 2, mw: 3, pre: "Tope ", post: " al mes", align: "left" } },
    }).benef.lineas;
    expect(capOnly[0]).toMatchObject({ t: "Tope {importe} al mes", align: "left" });
  });

  it("an empty list of lines is the same as no list", () => {
    expect(resolveCalibration({ benef: { lineas: [] } }).benef.lineas).toHaveLength(6);
  });

  it("does not let a flyer write on the defaults", () => {
    const first = resolveCalibration();
    first.empresa.yc = 1;
    expect(resolveCalibration().empresa.yc).toBe(725);
  });
});
