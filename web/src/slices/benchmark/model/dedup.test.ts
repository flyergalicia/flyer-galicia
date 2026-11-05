import { describe, expect, it } from "vitest";
import { duplicateKey, withoutDuplicates } from "./dedup.ts";
import type { BenchPromotion } from "./rows.ts";

const FARMACITY: BenchPromotion = {
  id: "bbva:b2",
  banco: "bbva",
  marca_clave: "farmacity",
  pct: 20,
  tope: 5000,
  dias_n: [0],
  credito: true,
  debito: false,
};

function level(nivel: number, tope: number): BenchPromotion {
  return {
    banco: "macro",
    marca_clave: "ypf",
    pct: 30,
    tope,
    segmento_txt: `Macro Selecta · YPF Selecta Nivel ${String(nivel)}`,
  };
}

describe("the same promotion seen twice", () => {
  it("has the same key from MODO and from the website, as claveDup of benchmark-sync", () => {
    expect(duplicateKey(FARMACITY)).toBe("bbva|farmacity|20|0|0|1|0|");
    expect(duplicateKey({ ...FARMACITY, id: "otro", fuente: "bbva", tope: 8000 })).toBe(
      duplicateKey(FARMACITY),
    );
    expect(duplicateKey({ ...FARMACITY, pct: 25 })).not.toBe(duplicateKey(FARMACITY));
    expect(duplicateKey({ banco: "macro" })).toBe("macro|||0||0|0|");
  });

  it("counts once, and the one of the website stays wherever it came", () => {
    const website = { ...FARMACITY, id: "bbva:bx1", fuente: "bbva", tope: 8000 };
    expect(withoutDuplicates([FARMACITY, website])).toEqual([website]);
    expect(withoutDuplicates([website, FARMACITY])).toEqual([website]);
    expect(withoutDuplicates([website, { ...website, id: "bbva:bx2" }])).toEqual([website]);
  });

  it("keeps apart the levels of Macro Selecta: same %, days and cards, another cap", () => {
    expect(withoutDuplicates([level(2, 30_000), level(4, 90_000)])).toHaveLength(2);
    expect(
      withoutDuplicates([
        level(2, 30_000),
        { ...level(2, 30_000), segmento_txt: "", beneficio: "Nivel 2" },
      ]),
    ).toHaveLength(1);
  });
});
