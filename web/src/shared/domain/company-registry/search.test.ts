import { describe, expect, it } from "vitest";
import { matchingPositions, searchCompanies } from "./search.ts";

const row = (empresa: string, ...cuits: readonly string[]) => ({ empresa, cuits });
const ACME = row("ACME S.A.", "30711111111");
const BETA = row("BETA SA", "30722222222");
const SUR = row("Transportes del Sur S.R.L.", "30733333333", "30744444444");
const ROWS = [ACME, BETA, SUR];

function names(query: string, limit?: number): string[] {
  return searchCompanies(query, ROWS, limit).map(({ empresa }) => empresa);
}

describe("the search", () => {
  it("dots do not count: S.A. finds SA and SA finds S.A.", () => {
    expect(names("BETA S.A.")).toEqual(["BETA SA"]);
    expect(names("acme sa")).toEqual(["ACME S.A."]);
    expect(names("transportes s.r.l.")).toEqual(["Transportes del Sur S.R.L."]);
  });

  it("finds all the words, in any order", () => {
    expect(names("sur transportes")).toEqual([SUR.empresa]);
    expect(names("zzz")).toEqual([]);
  });

  it("finds a tax id from three digits, with or without separators", () => {
    expect(names("30-73333333-3")).toEqual([SUR.empresa]);
    expect(names("30744444444")).toEqual([SUR.empresa]);
    expect(names("3072")).toEqual([BETA.empresa]);
    expect(names("30"), "two digits are not a tax id").toEqual([]);
  });

  it("empty shows them all, up to the limit", () => {
    expect(names("")).toHaveLength(3);
    expect(names("", 2)).toHaveLength(2);
    expect(names("s", 1), "it stops at the limit").toHaveLength(1);
  });

  it("a row without a name is found only by its tax id", () => {
    expect(searchCompanies("algo", [row("", "307")])).toEqual([]);
  });
});

describe("the filter of the editor", () => {
  it("gives the real position of each row", () => {
    expect(matchingPositions("beta", ROWS)).toEqual([1]);
    expect(matchingPositions("3074", ROWS)).toEqual([2]);
    expect(matchingPositions("", ROWS)).toEqual([0, 1, 2]);
  });

  it("the dots do count here, as they do today", () => {
    expect(matchingPositions("acme sa", ROWS)).toEqual([]);
  });

  it("a hole in the list is not a match", () => {
    const holes: { empresa: string; cuits: readonly string[] }[] = [];
    holes[1] = ACME;

    expect(matchingPositions("acme", holes)).toEqual([1]);
  });
});
