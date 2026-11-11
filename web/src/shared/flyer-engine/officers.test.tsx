import { describe, expect, it } from "vitest";
import { extraHeightFor, officerLocationText, officerRows, officersOf } from "./officers.ts";
import { paintedCanvas, testScene } from "./testing/test-scene.ts";
import { type FlyerValues } from "./types.ts";

const PIN = String.fromCodePoint(0x1f4cd);

function withOfficers(count: number, extra: Partial<FlyerValues> = {}): FlyerValues {
  const values: FlyerValues = { empresa: "X", ...extra };
  for (const [number, suffix] of [
    [1, ""],
    [2, "2"],
    [3, "3"],
    [4, "4"],
    [5, "5"],
    [6, "6"],
    [7, "7"],
    [8, "8"],
  ] as const) {
    if (number <= count) {
      values[`has${number}`] = true;
      values[`nombre${suffix}`] = `Oficial ${String(number)}`;
    }
  }
  return values;
}

describe("officersOf", () => {
  it("only counts the ones switched on and with a name", () => {
    expect(
      officersOf({
        empresa: "X",
        has1: true,
        nombre: "Ana",
        celular: "Cel: 1",
        email: "a@b",
        ubic1: "  Sede  ",
        has2: false,
        nombre2: "Luis",
        has3: true,
        nombre3: "   ",
      }),
    ).toEqual([{ name: "Ana", phone: "Cel: 1", email: "a@b", location: "Sede" }]);
    expect(officersOf({ empresa: "X", has1: true })).toEqual([]);
  });

  it("stops at four unless it is by branch", () => {
    expect(officersOf(withOfficers(8))).toHaveLength(4);
    expect(officersOf(withOfficers(8, { sedes: true }))).toHaveLength(8);
  });

  it("gives what is missing an empty text", () => {
    expect(officersOf(withOfficers(1))[0]).toEqual({
      name: "Oficial 1",
      phone: "",
      email: "",
      location: "",
    });
  });
});

describe("officerRows", () => {
  it.each([
    [0, 1],
    [3, 1],
    [4, 2],
  ])("normal, with %i officers, %i rows", (count, rows) => {
    expect(officerRows(count)).toBe(rows);
  });

  it.each([
    [0, 1],
    [1, 1],
    [2, 1],
    [5, 3],
    [8, 4],
  ])("by branch, with %i officers, %i rows", (count, rows) => {
    expect(officerRows(count, true)).toBe(rows);
  });
});

describe("officerLocationText", () => {
  it("the pin alone is no location", () => {
    expect(officerLocationText(`${PIN} `)).toBe("");
    expect(officerLocationText(null)).toBe("");
    expect(officerLocationText("  ")).toBe("");
  });

  it("keeps the pin with what was written", () => {
    expect(officerLocationText(` ${PIN} Rosario `)).toBe(`${PIN} Rosario`);
  });
});

describe("extraHeightFor", () => {
  it("with up to three it does not grow, and with four it grows one row", () => {
    expect(extraHeightFor(testScene(), withOfficers(3))).toBe(0);
    expect(extraHeightFor(testScene(), withOfficers(4))).toBe(130);
  });

  it("grows with the real width of the picture", () => {
    const scene = testScene({ art: paintedCanvas(620, 3000) });
    expect(extraHeightFor(scene, withOfficers(4))).toBe(65);
  });

  it("by branch, the whole block takes the place of the band, plus its title", () => {
    const scene = testScene();
    const eightRows = 4 * 172 - 130;
    expect(extraHeightFor(scene, withOfficers(8, { sedes: true }))).toBe(eightRows);
    expect(extraHeightFor(scene, withOfficers(8, { sedes: true, sedesTit: " Sedes " }))).toBe(
      eightRows + 64,
    );
    expect(extraHeightFor(scene, withOfficers(8, { sedes: true, sedesTit: "  " }))).toBe(eightRows);
  });

  it("by branch, it never shrinks", () => {
    const scene = testScene({ calibration: { contacto: { eh: 500, ehS: 100 } } });
    expect(extraHeightFor(scene, withOfficers(1, { sedes: true }))).toBe(0);
  });

  it("a zero in the calibration falls back on the usual heights", () => {
    const scene = testScene({ calibration: { contacto: { eh: 0, ehS: 0, titH: 0 } } });
    expect(extraHeightFor(scene, withOfficers(4))).toBe(130);
    expect(extraHeightFor(scene, withOfficers(1, { sedes: true, sedesTit: "T" }))).toBe(
      160 - 130 + 64,
    );
  });
});
