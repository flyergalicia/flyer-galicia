import { describe, expect, it } from "vitest";
import { benefitSignature, mergeModoPromotions, modoBrandKey, type ModoRow } from "./modo.ts";
import type { Promotion } from "./promotion.ts";

const TODAY = new Date(2026, 9, 30);
const GALICIA: Promotion = { id: 1, titulo: "Coto", beneficio: "25% de ahorro.", dias: "Martes" };

function row(fields: Partial<ModoRow> = {}): ModoRow {
  return { id: "a1", titulo: "COTO", beneficio: "25% de reintegro", dias: "Martes", ...fields };
}

describe("comparing with Galicia", () => {
  it("the brand does not mind generic words or spaces", () => {
    expect(modoBrandKey("Supermercados Alvear")).toBe(modoBrandKey("Alvear Supermercados"));
    expect(modoBrandKey("BLOW MAX")).toBe(modoBrandKey("Blowmax"));
    expect(modoBrandKey(null)).toBe("");
  });

  it("the benefit is its numbers", () => {
    expect(benefitSignature("25% de ahorro")).toBe(benefitSignature("25% de reintegro"));
    expect(benefitSignature("20% y hasta 6 cuotas")).toBe("c6,p20");
    expect(benefitSignature("20 por ciento")).toBe("p20");
    expect(benefitSignature("Regalá Cine")).toBe("");
    expect(benefitSignature(null)).toBe("");
  });
});

describe("MODO joins the catalog", () => {
  it("without what Galicia already has", () => {
    const { modo, all } = mergeModoPromotions([GALICIA], [row()], TODAY);
    expect(modo).toEqual([]);
    expect(all).toEqual([GALICIA]);
  });

  it("with what is different: another benefit, or the same on other days", () => {
    const { modo, all } = mergeModoPromotions(
      [GALICIA],
      [row({ id: "b", beneficio: "30%" }), row({ id: "c", dias: "Domingos" })],
      TODAY,
    );
    expect(modo.map(({ id }) => id)).toEqual(["m:b", "m:c"]);
    expect(modo[0]).toMatchObject({ origen: "modo", tipo_promocion: "MODO", titulo: "COTO" });
    expect(all).toHaveLength(3);
  });

  it("the same benefit without days to compare counts as the same", () => {
    expect(mergeModoPromotions([GALICIA], [row({ dias: null })], TODAY).modo).toEqual([]);
    expect(mergeModoPromotions([{ ...GALICIA, dias: null }], [row()], TODAY).modo).toEqual([]);
  });

  it("an upcoming one of Galicia does not hide one of MODO that is running", () => {
    const upcoming = { ...GALICIA, proximamente: true };
    expect(mergeModoPromotions([upcoming], [row()], TODAY).modo).toHaveLength(1);
    expect(mergeModoPromotions([upcoming], [row({ proximamente: true })], TODAY).modo).toEqual([]);
  });

  it("without numbers there is nothing to compare: it joins", () => {
    expect(
      mergeModoPromotions([GALICIA], [row({ beneficio: "Regalá Cine" })], TODAY).modo,
    ).toHaveLength(1);
  });

  it("what has expired does not join, and a row without id neither", () => {
    expect(
      mergeModoPromotions(
        [GALICIA],
        [row({ id: "v", beneficio: "9%", fecha_hasta: "2026-10-01" })],
        TODAY,
      ).modo,
    ).toEqual([]);
    expect(mergeModoPromotions([], [row({ id: "" })], TODAY).modo).toEqual([]);
  });

  it("without any, it is the same list: what was worked out on it is not lost", () => {
    const galicia = [GALICIA, { id: 2, titulo: "   " }];
    expect(mergeModoPromotions(galicia, [], TODAY).all).toBe(galicia);
  });
});
