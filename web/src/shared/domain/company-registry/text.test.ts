import { describe, expect, it } from "vitest";
import { asText, columnKey, digitsOf, formatTaxId, normalizeName, parseTaxIds } from "./text.ts";

describe("the text of a company", () => {
  it("nothing is an empty text, and a number is its text", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(12_345)).toBe("12345");
  });

  it("a name is compared without accents, capitals or extra blanks", () => {
    expect(normalizeName("  Peñá   S.A. ")).toBe("pena s.a.");
    expect(normalizeName(null)).toBe("");
  });

  it("a column is called the same, however it is written", () => {
    expect(columnKey("Asesor1_Nombre ")).toBe("asesor1nombre");
    expect(columnKey("Razón Social")).toBe("razonsocial");
  });

  it("only the digits of a number remain", () => {
    expect(digitsOf("30-71234567-8")).toBe("30712345678");
    expect(digitsOf(null)).toBe("");
  });
});

describe("tax ids", () => {
  it("a cell gives each one in digits, with any separator", () => {
    expect(parseTaxIds("30-71234567-8, 30709876543; 3 / 4 | 5\n6")).toEqual([
      "30712345678",
      "30709876543",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(parseTaxIds("")).toEqual([]);
    expect(parseTaxIds("sin dígitos")).toEqual([]);
  });

  it("only one of 11 digits gets its dashes: nothing else is invented", () => {
    expect(formatTaxId("30712345678")).toBe("30-71234567-8");
    expect(formatTaxId("307")).toBe("307");
  });
});
