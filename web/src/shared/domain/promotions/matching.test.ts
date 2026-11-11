import { describe, expect, it } from "vitest";
import {
  findCandidates,
  isBetterPromotion,
  matchBrand,
  promotionsByTitle,
  siblingPromotions,
} from "./matching.ts";
import type { Promotion } from "./promotion.ts";

let nextId = 0;

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  nextId += 1;
  return { id: nextId, titulo, fecha_hasta: "2027-01-01", ...fields };
}

function bestOf(brand: string, titles: readonly string[]) {
  return matchBrand(
    brand,
    titles.map((title) => promotion(title)),
  );
}

describe("a brand finds its promotion", () => {
  it("written the same, or differently", () => {
    expect(bestOf("Café Martínez", ["cafe martinez"]).best?.score).toBe(100);
    expect(bestOf("Sushi Club", ["SushiClub"]).best?.score).toBe(95);
    expect(bestOf("Rey Sol", ["El Rey del Sol"]).best?.score).toBe(85);
    expect(bestOf("El Rey Sol Grande", ["Rey Sol"]).best?.score).toBe(80);
    expect(bestOf("Starbucks", ["Starbucks Coffee"]).best?.score).toBe(75);
    expect(bestOf("Buckstar", ["ElBuckstarDeHoy"]).best?.score).toBe(70);
    expect(bestOf("Lagran Tiendita Azul", ["Tiendita"]).best?.score).toBe(65);
    expect(bestOf("Nada Vera Luna Hoy", ["Tres Vera Luna"]).best?.score).toBe(55);
    expect(bestOf("Barrio Norte", ["Pizza Norte"]).best?.score).toBe(40);
  });

  it("a generic word or a short one does not hold a match", () => {
    expect(bestOf("Rugby Club", ["Golf Club", "Niceto Club"]).best).toBeNull();
    expect(bestOf("Sol Mar", ["Mar Azul"]).best).toBeNull();
    expect(bestOf("Otra", []).best).toBeNull();
  });

  it("a weak one, or two close ones, have to be reviewed", () => {
    expect(bestOf("Barrio Norte", ["Pizza Norte"]).needsReview).toBe(true);
    expect(bestOf("Coto", ["Coto Sur", "Coto Norte"]).needsReview).toBe(true);
    expect(bestOf("Coto", ["Coto", "Coto Norte"]).needsReview).toBe(false);
    expect(bestOf("Coto", ["Coto"]).needsReview).toBe(false);
  });

  it("several promotions of a name are one candidate: the best", () => {
    const shorter = promotion("Coto", { fecha_hasta: "2026-12-01" });
    const longer = promotion("Coto", { fecha_hasta: "2027-06-01" });
    const candidates = findCandidates("Coto", [shorter, longer]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.promotion).toBe(longer);
    expect(findCandidates("Coto", [longer, shorter])[0]?.promotion).toBe(longer);
  });

  it("offers at most five to choose from", () => {
    const titles = ["Coto A", "Coto B", "Coto C", "Coto D", "Coto E", "Coto F"];
    expect(bestOf("Coto", titles).candidates).toHaveLength(5);
  });
});

describe("of two promotions of a brand", () => {
  it("the one running is better, and then the one that ends later", () => {
    const running = promotion("x", { fecha_hasta: "2026-01-01" });
    const upcoming = promotion("x", { fecha_hasta: "2030-01-01", proximamente: true });
    expect(isBetterPromotion(running, upcoming)).toBe(true);
    expect(isBetterPromotion(upcoming, running)).toBe(false);
    expect(isBetterPromotion(promotion("x", { fecha_hasta: "2027-01-01" }), running)).toBe(true);
    expect(isBetterPromotion(promotion("x", { fecha_hasta: null }), running)).toBe(false);
    expect(
      isBetterPromotion(
        promotion("x", { fecha_hasta: null }),
        promotion("x", { fecha_hasta: null }),
      ),
    ).toBe(false);
  });

  it("in a tie, the one of Galicia", () => {
    const galicia = promotion("x");
    const modo = promotion("x", { origen: "modo" });
    expect(isBetterPromotion(galicia, modo)).toBe(true);
    expect(isBetterPromotion(modo, galicia)).toBe(false);
    expect(isBetterPromotion(galicia, promotion("x"))).toBe(false);
  });
});

describe("the other promotions of a brand", () => {
  it("come with the same name only, the best first", () => {
    const chosen = promotion("Farmacity", { fecha_hasta: "2027-01-01" });
    const later = promotion("FARMACITY", { fecha_hasta: "2028-01-01" });
    const sooner = promotion("Farmacity", { fecha_hasta: "2026-12-01" });
    const same = promotion("Farmacity", { fecha_hasta: "2026-12-01" });
    const other = promotion("Farmacity.com");
    const byTitle = promotionsByTitle([chosen, later, sooner, same, other]);
    const siblings = siblingPromotions(chosen, byTitle);
    expect(siblings.slice(0, 2)).toEqual([later, sooner]);
    expect(siblings).toHaveLength(3);
    expect(siblings).not.toContain(other);
    expect(siblingPromotions(promotion("Nadie"), byTitle)).toEqual([]);
  });
});
