import { describe, expect, it } from "vitest";
import type { Promotion } from "./promotion.ts";
import { promotionZone, supermarketIndexOf } from "./supermarkets.ts";

let nextId = 0;

function supermarket(fields: Partial<Promotion> = {}): Promotion {
  nextId += 1;
  return {
    id: nextId,
    titulo: "Coto",
    subtitulo: "Supermercados",
    imagen: "coto.png",
    fecha_hasta: "2099-12-31",
    provincias: [],
    ...fields,
  };
}

const INSTALLMENTS = supermarket({ beneficio: "Hasta 12 cuotas", dias: "Todos los días" });
const DISCOUNT = supermarket({ beneficio: "25% de ahorro", dias: "Martes" });

describe("the days of a supermarket on the flyer", () => {
  it("are only those of its % discount, looking at any of its promotions", () => {
    const index = supermarketIndexOf([INSTALLMENTS, DISCOUNT]);
    expect(index.flyerDays(INSTALLMENTS)).toBe("Martes");
    expect(index.flyerDays(DISCOUNT)).toBe("Martes");
    expect(index.hasPercentDiscount(INSTALLMENTS)).toBe(true);
  });

  it("join all its discounts, by logo or by brand", () => {
    const friday = supermarket({ imagen: "", beneficio: "20%", dias: "Viernes" });
    const index = supermarketIndexOf([DISCOUNT, friday]);
    expect(index.flyerDays(DISCOUNT)).toBe("Martes y viernes");
  });

  it('say "Todos los días" if one of them is', () => {
    const always = supermarket({ beneficio: "5%", dias: "Todos los días" });
    expect(supermarketIndexOf([DISCOUNT, always]).flyerDays(DISCOUNT)).toBe("Todos los días");
  });

  it("are none without a discount", () => {
    const index = supermarketIndexOf([INSTALLMENTS]);
    expect(index.flyerDays(INSTALLMENTS)).toBe("");
    expect(index.hasPercentDiscount(INSTALLMENTS)).toBe(false);
  });

  it("go as they are if the sentence is not understood", () => {
    const odd = supermarket({ beneficio: "10%", dias: "Cuando abra" });
    expect(supermarketIndexOf([odd]).flyerDays(odd)).toBe("Cuando abra");
  });

  it("do not count what has expired or has not started", () => {
    const expired = supermarket({ beneficio: "10%", dias: "Lunes", fecha_hasta: "2020-01-01" });
    const upcoming = supermarket({ beneficio: "15%", dias: "Sábado", proximamente: true });
    const index = supermarketIndexOf([expired, upcoming, INSTALLMENTS]);
    expect(index.flyerDays(INSTALLMENTS)).toBe("");
    expect(index.hasPercentDiscount(INSTALLMENTS)).toBe(false);
  });

  it("without the column of the benefit in the whole base, are the days as they come", () => {
    const old = supermarket({ dias: "Jueves" });
    expect(supermarketIndexOf([old]).flyerDays(old)).toBe("Jueves");
  });

  it("are not asked of what is not a supermarket, nor of nothing", () => {
    const shop = supermarket({ subtitulo: "Hogar", dias: "Lunes", beneficio: "10%" });
    const index = supermarketIndexOf([shop]);
    expect(index.flyerDays(shop)).toBe("Lunes");
    expect(index.flyerDays(null)).toBe("");
    expect(index.hasPercentDiscount(shop)).toBe(false);
    expect(index.hasPercentDiscount(null)).toBe(false);
  });

  it("answer the same a second time, and the index is one per catalog", () => {
    const catalog = [DISCOUNT];
    const index = supermarketIndexOf(catalog);
    expect(index.flyerDays(DISCOUNT)).toBe(index.flyerDays(DISCOUNT));
    expect(supermarketIndexOf(catalog)).toBe(index);
    expect(supermarketIndexOf([DISCOUNT])).not.toBe(index);
  });
});

describe("the zone", () => {
  const inMendoza = supermarket({ beneficio: "20%", dias: "Lunes", provincias: ["MENDOZA"] });
  const inNeuquen = supermarket({
    beneficio: "Hasta 12 cuotas",
    dias: "Martes",
    provincias: ["NEUQUEN"],
  });
  const catalog = [inMendoza, inNeuquen];

  it("is the whole country without a province", () => {
    expect(promotionZone("")).toBeNull();
  });

  it("makes only its promotions count", () => {
    const index = supermarketIndexOf(catalog);
    const neuquen = promotionZone("NEUQUEN");
    const mendoza = promotionZone("MENDOZA");
    expect(index.flyerDays(inNeuquen)).toBe("Lunes");
    expect(index.flyerDays(inNeuquen, neuquen)).toBe("");
    expect(index.hasPercentDiscount(inNeuquen, neuquen)).toBe(false);
    expect(index.flyerDays(inNeuquen, mendoza)).toBe("Lunes");
    expect(index.hasPercentDiscount(inNeuquen, mendoza)).toBe(true);
  });

  it("with nothing of that supermarket there, has no days", () => {
    const old = supermarket({ provincias: ["MENDOZA"], dias: "Jueves" });
    expect(supermarketIndexOf([old]).flyerDays(old, promotionZone("NEUQUEN"))).toBe("");
  });

  it("with a locality, looks at what Galicia answered, and online ones count", () => {
    const here = supermarket({ provincias: ["MENDOZA"], beneficio: "Cuotas", dias: "Lunes" });
    const there = supermarket({ provincias: ["MENDOZA"], beneficio: "30%", dias: "Martes" });
    const online = supermarket({ provincias: [], beneficio: "Cuotas", dias: "Domingo" });
    const zone = promotionZone("MENDOZA", "LUJAN", [here.id]);
    expect(zone?.key).toBe("MENDOZA|LUJAN|1");
    expect(zone?.includes(here)).toBe(true);
    expect(zone?.includes(there)).toBe(false);
    expect(zone?.includes(online)).toBe(true);
    expect(promotionZone("MENDOZA", "LUJAN")?.includes(there)).toBe(true);
    expect(promotionZone("MENDOZA", "LUJAN")?.key).toBe("MENDOZA|");
  });
});
