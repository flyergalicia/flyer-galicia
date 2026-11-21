import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  formatDate,
  lowerCased,
  normalizeText,
  normalizeWithoutSpaces,
  rememberedText,
  titleCase,
} from "./text.ts";

describe("the text of the catalog", () => {
  it("decodes the entities Galicia leaves in its titles", () => {
    expect(decodeEntities("Le Club Libros &amp; M&uacute;sica")).toBe("Le Club Libros & Música");
    expect(decodeEntities("Sin entidades")).toBe("Sin entidades");
    expect(decodeEntities(null)).toBe("");
  });

  it("compares without accents, capitals or punctuation", () => {
    expect(normalizeText("Café Martínez")).toBe("cafe martinez");
    expect(normalizeText("McDonald's")).toBe("mcdonalds");
    expect(normalizeText("  A&amp;B -- C  ")).toBe("a b c");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeWithoutSpaces("Sushi Club")).toBe("sushiclub");
  });

  it("works each text out once, and forgets when it reaches its ceiling", () => {
    let computed = 0;
    const remembered = rememberedText((text) => {
      computed += 1;
      return text.toUpperCase();
    }, 2);
    expect(remembered("a")).toBe("A");
    expect(remembered("a")).toBe("A");
    expect(computed).toBe(1);
    remembered("b");
    remembered("c");
    remembered("a");
    expect(computed).toBe(4);
  });

  it("writes capitals as names", () => {
    expect(titleCase("SAN CARLOS DE BARILOCHE")).toBe("San Carlos De Bariloche");
    expect(titleCase("CÓRDOBA (CAPITAL)")).toBe("Córdoba (Capital)");
    expect(titleCase(null)).toBe("");
    expect(lowerCased("ABC")).toBe("abc");
  });

  it("writes a date as it reads", () => {
    expect(formatDate("2026-10-31T00:00:00")).toBe("31/10/2026");
    expect(formatDate("")).toBe("-");
    expect(formatDate(null)).toBe("-");
    expect(formatDate("otra cosa")).toBe("otra cosa");
  });
});
