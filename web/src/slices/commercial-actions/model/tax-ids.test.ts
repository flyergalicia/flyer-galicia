import { describe, expect, it } from "vitest";
import {
  contactLink,
  cuilOrReferenceText,
  formatCuil,
  isValidCuil,
  readCuilOrReference,
  taxIdList,
  taxIdText,
} from "./tax-ids.ts";

describe("CUIL or reference", () => {
  it.each([
    ["20-12345678-6", { cuil: "20123456786" }],
    ["Legajo 302", { referencia: "Legajo 302" }],
    ["30123456", { referencia: "30123456" }],
    ["", {}],
    ["  ", {}],
  ])("reads %j", (text, expected) => {
    expect(readCuilOrReference(text)).toEqual(expected);
  });

  it("warns about 11 digits that are not a valid CUIL", () => {
    expect(readCuilOrReference("20-12345678-0").error).toMatch(/no es válido/);
  });

  it("cuts a long reference", () => {
    expect(readCuilOrReference(`x${"y".repeat(200)}`).referencia).toHaveLength(120);
  });

  it("writes it back", () => {
    expect
      .soft(cuilOrReferenceText({ cuil: "20123456786", referencia: null }))
      .toBe("20-12345678-6");
    expect.soft(cuilOrReferenceText({ cuil: null, referencia: "Legajo 3" })).toBe("Legajo 3");
    expect.soft(cuilOrReferenceText({ cuil: null, referencia: null })).toBe("");
  });
});

describe("a CUIL is valid", () => {
  it.each([
    ["20-12345678-6", true],
    ["27111111117", true],
    ["20-12345678-0", false],
    ["99-12345678-6", false],
    ["2012345678", false],
    [null, false],
  ])("%j: %s", (value, expected) => {
    expect(isValidCuil(value)).toBe(expected);
  });

  it("with a check of 11 and of 10", () => {
    // 11 - (sum % 11) gives 11: the check is 0; it gives 10: the check is 9.
    expect.soft(isValidCuil("20060000000")).toBe(true);
    expect.soft(isValidCuil("20060000001")).toBe(false);
    expect.soft(isValidCuil("20000000019")).toBe(true);
    expect.soft(isValidCuil("20000000010")).toBe(false);
  });

  it("writes what is not a CUIL as it comes", () => {
    expect(formatCuil("12")).toBe("12");
  });
});

describe("the CUIT of a company", () => {
  it.each([
    ["30900001118,30712345678", "CUIT 30-90000111-8 · 30-71234567-8"],
    [["30900001118"], "CUIT 30-90000111-8"],
    [null, ""],
  ])("%j reads %j", (value, expected) => {
    expect(taxIdText(value)).toBe(expected);
  });

  it("is a list of digits, whichever way it came", () => {
    expect.soft(taxIdList("30-1;  20 2")).toEqual(["301", "20", "2"]);
    expect.soft(taxIdList(undefined)).toEqual([]);
  });
});

describe("a contact", () => {
  it.each([
    ["ana@mail.com", "mailto:ana@mail.com"],
    ["11 5555-1234", "tel:1155551234"],
    ["+54 11 5555", "tel:+54115555"],
    ["12345", null],
    ["no tiene", null],
  ])("%j links to %j", (contact, expected) => {
    expect(contactLink(contact)).toBe(expected);
  });
});
