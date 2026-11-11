import { describe, expect, it } from "vitest";
import {
  accessLevel,
  audienceText,
  bestOf,
  capText,
  isHttps,
  isTopValue,
  money,
  mostInstallments,
  promotionLink,
  returned,
  scheduleText,
} from "./offers.ts";
import { REFERENCE_DEFAULTS } from "./reference.ts";
import type { BenchPromotion } from "./rows.ts";

const REFS = REFERENCE_DEFAULTS;
const SUPER = "Supermercados";

function promo(fields: BenchPromotion): BenchPromotion {
  return { banco: "galicia", rubro: SUPER, titulo: "Coto", ...fields };
}

describe("what a promotion gives back", () => {
  it("is the lower of purchase × % and the cap", () => {
    expect(returned(promo({ pct: 25, tope: 10_000 }), REFS)).toBe(10_000);
    expect(returned(promo({ pct: 20, tope: 30_000 }), REFS)).toBe(30_000);
    expect(returned(promo({ pct: 10, tope: 99_999 }), REFS)).toBe(15_000);
  });

  it("without a cap, all of the percent", () => {
    expect(returned(promo({ pct: 10, tope: null }), REFS)).toBe(15_000);
    expect(returned(promo({ pct: 10, tope: 0 }), REFS)).toBe(15_000);
  });

  it("uses the purchase of its rubro, or the one of the rest", () => {
    expect(returned(promo({ rubro: "Salud y Bienestar", pct: 30, tope: 15_000 }), REFS)).toBe(
      12_000,
    );
    expect(returned(promo({ rubro: "Hogar", pct: 10 }), REFS)).toBe(5000);
    expect(returned(promo({ rubro: "Hogar", pct: 10 }), { ...REFS, Otros: 0 })).toBe(5000);
  });

  it('gives back nothing with installments only, and "100% OFF" is no refund', () => {
    expect(returned(promo({ cuotas: 12 }), REFS)).toBeNull();
    expect(returned(promo({ pct: 0 }), REFS)).toBeNull();
    expect(returned(promo({ pct: 100 }), REFS)).toBeNull();
    expect(returned(promo({ pct: 120 }), REFS)).toBeNull();
  });

  it("is written as money of Argentina", () => {
    expect(money(12_000.4)).toBe("$12.000");
  });
});

describe("the cap", () => {
  it("says its period", () => {
    expect(capText(promo({ tope: 10_000, tope_por: "month" }))).toBe("tope $10.000 por mes");
    expect(capText(promo({ tope: 10_000, tope_por: "week" }))).toBe("tope $10.000 por semana");
    expect(capText(promo({ tope: 10_000, tope_por: "day" }))).toBe("tope $10.000 por día");
    expect(capText(promo({ tope: 10_000, tope_por: "transaction" }))).toBe(
      "tope $10.000 por compra",
    );
    expect(capText(promo({ tope: 15_000, tope_por: "total" }))).toBe("tope $15.000 en total");
    expect(capText(promo({ tope: 15_000 }))).toBe("tope $15.000");
  });

  it("without one, says so", () => {
    expect(capText(promo({ tope: null }))).toBe("sin tope informado");
  });
});

function ofSegment(segmento_txt: string, beneficio = ""): string {
  return audienceText(promo({ segmento: "clasico", segmento_txt, beneficio }));
}

describe("who it is only for", () => {
  it("names the package of a benefit loaded by hand", () => {
    expect(
      audienceText(promo({ segmento_txt: "paquete Black+ All · Visa Signature por NFC" })),
    ).toBe("Paquete Black+ All");
  });

  it("names the clients of Galicia, only for Galicia", () => {
    expect(audienceText(promo({ segmento_txt: "clientes haberes galicia eminent" }))).toBe(
      "Haberes Galicia Éminent",
    );
    expect(audienceText(promo({ banco: "bbva", segmento_txt: "clientes haberes galicia" }))).toBe(
      "",
    );
  });

  it("names the segment Galicia writes, or the level, or the card", () => {
    expect(ofSegment("Clientes Plus Gold")).toBe("Plus Gold");
    expect(ofSegment("Clientes Move")).toBe("Move");
    expect(ofSegment("Macro Selecta · YPF Selecta Nivel 2")).toBe("Selecta Nivel 2");
    expect(ofSegment("Macro Selecta")).toBe("Selecta");
    expect(ofSegment("", "30% Nivel 3")).toBe("Nivel 3");
    expect(ofSegment("pagando con Visa Platinum Macro")).toBe("Visa Platinum");
    expect(ofSegment("Supervielle identite")).toBe("Identité");
    expect(ofSegment("para eminent")).toBe("Éminent");
    expect(ofSegment("")).toBe("Clásico/Gold");
    expect(audienceText(promo({ segmento: "premium" }))).toBe("Premium");
  });

  it("is nobody when the promotion is for everybody", () => {
    expect(audienceText(promo({}))).toBe("");
  });
});

describe("when it starts", () => {
  const TODAY = "2026-10-30";

  it("a promotion of one day says so", () => {
    expect(
      scheduleText(promo({ fecha_desde: "2026-11-10", fecha_hasta: "2026-11-10" }), TODAY),
    ).toBe("Sólo el 10/11 (un solo día)");
  });

  it("one that has not started says when", () => {
    expect(
      scheduleText(promo({ fecha_desde: "2026-11-05", fecha_hasta: "2026-12-01" }), TODAY),
    ).toBe("Empieza el 5/11");
    expect(scheduleText(promo({ fecha_desde: "2026-10-01" }), TODAY)).toBe("");
    expect(scheduleText(promo({}), TODAY)).toBe("");
  });

  it("takes today when nobody says it", () => {
    expect(scheduleText(promo({ fecha_desde: "2099-01-02" }))).toBe("Empieza el 2/1");
  });
});

describe("where to see it", () => {
  it("leads to MODO, the page of Galicia or of Santander", () => {
    expect(promotionLink({ fuente: "modo", slug: "abc oct", banco: "bbva" })).toBe(
      "https://www.modo.com.ar/promos/abc%20oct",
    );
    expect(promotionLink({ slug: "", banco: "bbva" })).toBe("");
    expect(promotionLink({ fuente: "galicia", id: "galicia:g187090" })).toBe(
      "https://beneficios.galicia.ar/promocion/187090",
    );
    expect(promotionLink({ fuente: "santander", slug: "brand:546" })).toBe(
      "https://www.santander.com.ar/personas/beneficios#/brand?brandId=546",
    );
  });

  it("else, to the page of benefits of the bank", () => {
    expect(promotionLink({ fuente: "bbva", banco: "bbva" })).toBe("https://go.bbva.com.ar/");
    expect(promotionLink({ fuente: "web", banco: "otro" })).toBe("");
  });

  it("a hand-loaded one, only to an address that starts with https", () => {
    expect(promotionLink({ fuente: "manual", fuente_url: "https://x.com/a" })).toBe(
      "https://x.com/a",
    );
    expect(promotionLink({ fuente: "manual", fuente_url: "javascript:alert(1)" })).toBe("");
    expect(promotionLink({ fuente: "manual" })).toBe("");
    expect(isHttps("HTTPS://x")).toBe(true);
    expect(isHttps(null)).toBe(false);
  });
});

describe("the best of a bank", () => {
  it("is the one that gives back the most", () => {
    const best = bestOf(
      [promo({ pct: 10, tope: 1000 }), promo({ titulo: "Dia", pct: 20 }), promo({ cuotas: 6 })],
      REFS,
    );
    expect(best?.row.titulo).toBe("Dia");
    expect(best?.value).toBe(30_000);
    expect(bestOf([promo({ cuotas: 6 })], REFS)).toBeNull();
  });

  it("on a tie, the most accessible, then the lowest cap", () => {
    const level4 = promo({ titulo: "N4", pct: 30, tope: 90_000, segmento: "premium" });
    const level2 = promo({ titulo: "N2", pct: 30, tope: 30_000, segmento: "premium" });
    const everybody = promo({ titulo: "Todos", pct: 30, tope: 60_000 });
    expect(bestOf([level4, level2], { ...REFS, Supermercados: 60_000 })?.row.titulo).toBe("N2");
    expect(bestOf([level2, level4], { ...REFS, Supermercados: 60_000 })?.row.titulo).toBe("N2");
    expect(bestOf([level2, everybody], { ...REFS, Supermercados: 60_000 })?.row.titulo).toBe(
      "Todos",
    );
    expect(
      bestOf([level2, promo({ titulo: "Sin tope", pct: 30, segmento: "premium" })], {
        ...REFS,
        Supermercados: 60_000,
      })?.row.titulo,
    ).toBe("N2");
  });

  it("a little more is not more: half a peso is a tie", () => {
    const first = promo({ titulo: "A", pct: 10, tope: 1000, segmento: "premium" });
    const almost = promo({ titulo: "B", pct: 10, tope: 1000.4 });
    expect(bestOf([first, almost], REFS)?.row.titulo).toBe("B");
  });

  it("knows how few can use it", () => {
    expect(accessLevel(promo({}))).toBe(0);
    expect(accessLevel(promo({ segmento: "clasico" }))).toBe(1);
    expect(accessLevel(promo({ segmento: "premium" }))).toBe(2);
  });

  it("the longest installments compare apart", () => {
    expect(
      mostInstallments([promo({ cuotas: 6 }), promo({ titulo: "Doce", cuotas: 12 }), promo({})])
        ?.titulo,
    ).toBe("Doce");
    expect(mostInstallments([promo({ pct: 10 })])).toBeNull();
  });

  it("is green when it is as good as the best", () => {
    const offer = { row: promo({}), value: 99.6 };
    expect(isTopValue(offer, 100)).toBe(true);
    expect(isTopValue(offer, 101)).toBe(false);
    expect(isTopValue(offer, 0)).toBe(false);
    expect(isTopValue(null, 100)).toBe(false);
  });
});
