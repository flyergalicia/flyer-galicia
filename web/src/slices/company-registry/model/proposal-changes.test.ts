import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { proposalChanges } from "./proposal-changes.ts";

const CONTEXT = {
  options: sanitizeFlyerOptions([{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }]),
  cashbackNames: ["BAU", "Config 1"],
};
const BASE = {
  config: null,
  config_antes: null,
  rubro: null,
  rubro_antes: null,
  asesores_antes: [],
  asesores: [],
};

describe("what a proposal changes", () => {
  it("officers only, in the usual proposal", () => {
    expect(
      proposalChanges(
        { ...BASE, asesores_antes: [{ nombre: "Ana" }], asesores: [{ nombre: "Beto" }] },
        CONTEXT,
      ),
    ).toEqual([["Oficial", "Ana · nombre Ana → Beto"]]);
  });

  it("a substitute can also ask for the cashback", () => {
    expect(proposalChanges({ ...BASE, config_antes: "BAU", config: "" }, CONTEXT)).toEqual([
      ["Cashback", "BAU → Sin cashback"],
    ]);
    expect(proposalChanges({ ...BASE, config_antes: "BAU", config: "BAU" }, CONTEXT)).toEqual([]);
  });

  it("and for the category, with what it is called", () => {
    expect(
      proposalChanges(
        { ...BASE, rubro_antes: { txt: "Viejo" }, rubro: { opcion: 4, importe: "1000" } },
        CONTEXT,
      ),
    ).toEqual([["Rubro", "Viejo → Combustible · $1.000"]]);
    expect(proposalChanges({ ...BASE, rubro: { opcion: 4 } }, CONTEXT)).toEqual([
      ["Rubro", "sin rubro → Combustible"],
    ]);
    expect(proposalChanges({ ...BASE, rubro: {}, rubro_antes: {} }, CONTEXT)).toEqual([]);
  });

  it("null means that data is not touched", () => {
    expect(proposalChanges(BASE, CONTEXT)).toEqual([]);
  });
});
