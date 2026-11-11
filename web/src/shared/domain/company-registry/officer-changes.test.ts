import { describe, expect, it } from "vitest";
import { officerChanges } from "./officer-changes.ts";

const ANA = { nombre: "Ana", celular: "11", email: "a@b.c" };

describe("what changed in the officers", () => {
  it("nothing says nothing", () => {
    expect(officerChanges([ANA], [ANA])).toEqual([]);
    expect(officerChanges(null, "x")).toEqual([]);
    expect(officerChanges([{}, null], [{ nombre: " " }])).toEqual([]);
  });

  it("one that arrives and one that goes", () => {
    expect(officerChanges([], [ANA])).toEqual([["Oficial agregado", "Ana"]]);
    expect(officerChanges([ANA], [])).toEqual([["Oficial quitado", "Ana"]]);
  });

  it("names whoever has no name by what they have", () => {
    expect(officerChanges([], [{ email: "a@b.c" }])).toEqual([["Oficial agregado", "a@b.c"]]);
    expect(officerChanges([], [{ celular: "11" }])).toEqual([["Oficial agregado", "11"]]);
  });

  it("another name and another contact is another person", () => {
    expect(officerChanges([ANA], [{ nombre: "Luis", celular: "22", email: "a@b.c" }])).toEqual([
      ["Oficial reemplazado", "Ana → Luis"],
    ]);
    expect(officerChanges([ANA], [{ nombre: "Luis", celular: "11", email: "x@y.z" }])).toEqual([
      ["Oficial reemplazado", "Ana → Luis"],
    ]);
  });

  it("a correction says what changed", () => {
    expect(officerChanges([ANA], [{ ...ANA, celular: "22" }])).toEqual([
      ["Oficial", "Ana · celular 11 → 22"],
    ]);
    expect(officerChanges([ANA], [{ ...ANA, email: "" }])).toEqual([
      ["Oficial", "Ana · mail a@b.c → —"],
    ]);
    expect(officerChanges([ANA], [{ ...ANA, nombre: "Ana María" }])).toEqual([
      ["Oficial", "Ana · nombre Ana → Ana María"],
    ]);
    expect(
      officerChanges(
        [{ nombre: "", celular: "11", email: "" }],
        [{ nombre: "Ana", celular: "11", email: "" }],
      ),
    ).toEqual([["Oficial", "11 · nombre — → Ana"]]);
  });
});
