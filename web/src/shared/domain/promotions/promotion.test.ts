import { describe, expect, it } from "vitest";
import {
  benefitText,
  isModoPromotion,
  isNewPromotion,
  isSupermarket,
  type Promotion,
  promotionHasPercent,
  promotionLink,
  promotionLogoSource,
  promotionNote,
  promotionOfLogo,
} from "./promotion.ts";

const BUCKET = (file: string) => `https://bucket.invalid/${file}`;
const NOW = Date.parse("2026-10-30T12:00:00Z");

function promotion(fields: Partial<Promotion> = {}): Promotion {
  return { id: 7, titulo: "Coto", ...fields };
}

describe("a promotion", () => {
  it("has its logo where it lives (invariant 26)", () => {
    expect(promotionLogoSource("modo/317.png", BUCKET)).toBe("https://bucket.invalid/modo/317.png");
    expect(promotionLogoSource("coto_180.png", BUCKET)).toMatch(
      /^https:\/\/www\.galicia\.ar\/.*\/coto_180\.png$/,
    );
    expect(promotionLogoSource("", BUCKET)).toBe("");
    expect(promotionLogoSource(null, BUCKET)).toBe("");
  });

  it("links to its public page: the id is what counts in Galicia", () => {
    expect(promotionLink(promotion({ id: 77, titulo: "Café &amp; Té" }))).toBe(
      `https://beneficios.galicia.ar/promocion/77|${encodeURIComponent("Café & Té")}|Marca`,
    );
    expect(promotionLink(promotion({ tipo_promocion: "Shopping" }))).toMatch(/\|Shopping$/);
    expect(promotionLink(null)).toBe("");
  });

  it("of MODO links to MODO, if it has an address", () => {
    const modo = promotion({ id: "m:a1", origen: "modo", slug: "ypf cuotas" });
    expect(isModoPromotion(modo)).toBe(true);
    expect(isModoPromotion(promotion())).toBe(false);
    expect(promotionLink(modo)).toBe("https://www.modo.com.ar/promos/ypf%20cuotas");
    expect(promotionLink(promotion({ id: "m:a2", origen: "modo", slug: "" }))).toBe("");
  });

  it("is new for a week, if the base knows when it appeared", () => {
    const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
    expect(isNewPromotion(promotion({ primera_vez: ago(2) }), NOW)).toBe(true);
    expect(isNewPromotion(promotion({ primera_vez: ago(8) }), NOW)).toBe(false);
    expect(isNewPromotion(promotion({ primera_vez: "no es fecha" }), NOW)).toBe(false);
    expect(isNewPromotion(promotion(), NOW)).toBe(false);
    expect(isNewPromotion(null)).toBe(false);
  });

  it("carries the red dot only if it is a supermarket with a %", () => {
    const supermarket = { subtitulo: "Supermercados" };
    expect(isSupermarket(promotion(supermarket))).toBe(true);
    expect(isSupermarket(promotion({ subtitulo: "Indumentaria" }))).toBe(false);
    expect(promotionHasPercent(promotion({ ...supermarket, beneficio: "25% de ahorro" }))).toBe(
      true,
    );
    expect(promotionHasPercent(promotion({ ...supermarket, beneficio: "12 cuotas" }))).toBe(false);
    expect(promotionHasPercent(promotion({ ...supermarket }))).toBe(false);
    expect(promotionHasPercent(promotion({ subtitulo: "Hogar", beneficio: "25%" }))).toBe(false);
    expect(promotionHasPercent(null)).toBe(false);
  });

  it("says its benefit and its note clean", () => {
    expect(benefitText(promotion({ beneficio: "25%  de ahorro. " }))).toBe("25% de ahorro");
    expect(benefitText(null)).toBe("");
    expect(promotionNote(promotion({ aclaracion: " Sólo  aceite " }))).toBe("Sólo aceite");
    expect(promotionNote(null)).toBe("");
  });

  it("is found by its logo", () => {
    const catalog = [promotion({ imagen: "a.png" }), promotion({ id: 8, imagen: "b.png" })];
    expect(promotionOfLogo(catalog, "b.png")?.id).toBe(8);
    expect(promotionOfLogo(catalog, "c.png")).toBeNull();
    expect(promotionOfLogo(null, "a.png")).toBeNull();
  });
});
