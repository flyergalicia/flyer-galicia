import { describe, expect, it } from "vitest";
import { legalWithValues, splitBold } from "./legal-text.ts";
import { testScene } from "./testing/test-scene.ts";

const VALUES = {
  empresa: "ACME SA",
  m1: "$250.000",
  m2: "$180.000",
  m3: "$80.000",
  m4: "$30.000",
  importe: "$24.000",
  importe2: "$30.000",
};

function filled(
  text: string | null | undefined,
  values = VALUES as typeof VALUES & { nocb?: boolean },
) {
  return legalWithValues(text, values, testScene());
}

describe("legalWithValues", () => {
  it("fills every marker", () => {
    expect(
      filled(
        "{empresa} {nombre} {importe} {importe2} {total} {cashback} {eminentblack} {platinum} {plusgold} {plus}",
      ),
    ).toBe("ACME SA ACME SA $24.000 $30.000 $54.000 $250.000 $250.000 $180.000 $80.000 $30.000");
  });

  it("does not mind case, spaces or underscores in the name", () => {
    expect(filled("{Plus Gold}|{plus_gold}|{ PLUSGOLD }")).toBe("$80.000|$80.000|$80.000");
  });

  it("leaves a marker it does not know, with its space", () => {
    expect(filled("a {desconocido} b {x y} c")).toBe("a {desconocido} b {x y} c");
  });

  it("takes away a marker with no value, and the space after it", () => {
    expect(filled("Tope {cashback} y fin", { ...VALUES, nocb: true })).toBe("Tope y fin");
    expect(legalWithValues("a {importe} b {total}c", { empresa: "X" }, testScene())).toBe("a b c");
  });

  it("keeps a dollar sign as a dollar sign", () => {
    expect(filled("Total: {importe}'")).toBe("Total: $24.000'");
    expect(legalWithValues("{empresa}", { empresa: "$' $& $1" }, testScene())).toBe("$' $& $1");
  });

  it("uses the first cap when there is no second one", () => {
    const values = { empresa: "X", importe: "$24.000" };
    expect(legalWithValues("{importe2}|{total}", values, testScene())).toBe("$24.000|$48.000");
  });

  it("returns the text as it is when it has no markers, and nothing for no text", () => {
    expect(filled("Sin marcadores")).toBe("Sin marcadores");
    expect(filled(null)).toBe("");
    expect(filled(undefined)).toBe("");
    expect(filled("{")).toBe("{");
  });
});

describe("splitBold", () => {
  it("takes the asterisks out and marks what they had", () => {
    expect(splitBold("Antes **fuerte** después")).toEqual([
      { text: "Antes ", bold: false },
      { text: "fuerte ", bold: true },
      { text: "después", bold: false },
    ]);
  });

  it("marks the fixed phrases of the bank", () => {
    expect(splitBold("Ver (6) Referidos. Bases")).toEqual([
      { text: "Ver ", bold: false },
      { text: "(6) Referidos. ", bold: true },
      { text: "Bases", bold: false },
    ]);
  });

  it("a fixed phrase before a written bold keeps its bold", () => {
    const segments = splitBold("(1) Promoción del 100% de ahorro. Texto **tope** fin");
    expect(segments).toEqual([
      { text: "(1) Promoción del 100% de ahorro. ", bold: true },
      { text: "Texto ", bold: false },
      { text: "tope ", bold: true },
      { text: "fin", bold: false },
    ]);
  });

  it("ignores asterisks with only spaces inside", () => {
    expect(splitBold("a **  ** b")).toEqual([{ text: "a    b", bold: false }]);
  });

  it("has nothing to say about nothing", () => {
    expect(splitBold("")).toEqual([]);
  });
});
