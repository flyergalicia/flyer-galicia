import { describe, expect, it } from "vitest";
import { aListedAction } from "../testing/fixtures.ts";
import {
  companiesCountText,
  companiesTable,
  COMPANY_FILTERS,
  filteredCompanies,
} from "./my-companies.ts";

const COMPANIES = [
  { empresa: "ALIMENTOS SA", cuits: ["30900001118"] },
  { empresa: "TEXTIL SA", cuits: ["30900005113"] },
  { empresa: "NUEVA SA", cuits: null },
];
const ACTIONS = [
  aListedAction({
    empresa: "ALIMENTOS SA",
    estado: "realizada",
    n_pros: 10,
    n_altas: 2,
    fecha: "2026-11-01",
    hunter_id: "h1",
  }),
  aListedAction({
    empresa: "alimentos  sa",
    estado: "realizada",
    n_pros: 5,
    n_altas: 1,
    fecha: "2026-11-03",
    hunter_id: "h2",
  }),
  aListedAction({ empresa: "TEXTIL SA", estado: "planificada", visto_dueno: false }),
  aListedAction({ empresa: "NUEVA SA", estado: "cancelada" }),
  aListedAction({ empresa: "AJENA SA", estado: "realizada", dueno_id: "o2", n_pros: 100 }),
];
const { lines, totals } = companiesTable(COMPANIES, ACTIONS, "o1");
const line = (name: string) => lines.find(({ empresa }) => empresa === name);
const names = (search: string, filter: string) =>
  filteredCompanies(lines, search, filter).map(({ empresa }) => empresa);

describe("Mis empresas", () => {
  it("adds what was done, for the same company even written differently", () => {
    expect(line("ALIMENTOS SA")?.stats).toMatchObject({
      done: 2,
      people: 15,
      signups: 3,
      forwarded: 2,
      lastDate: "2026-11-03",
      lastHunter: "h2",
    });
  });

  it("does not count what was done before the last one as last", () => {
    const [first, second] = ACTIONS;
    if (!first || !second) throw new Error("No actions");
    const reversed = companiesTable(COMPANIES, [second, first], "o1").lines[0];
    expect(reversed?.stats.lastHunter).toBe("h2");
  });

  it("counts what is planned and what is new", () => {
    expect(line("TEXTIL SA")?.stats).toMatchObject({ planned: 1, news: 1, forwarded: 1, done: 0 });
  });

  it("what was cancelled is not forwarded", () => {
    expect(line("NUEVA SA")?.stats.forwarded).toBe(0);
  });

  it("only counts what belongs to this officer", () => {
    expect(totals).toEqual({ done: 2, people: 15, signups: 3 });
  });

  it("reads the CUITs, and a company with none has none", () => {
    expect.soft(line("ALIMENTOS SA")?.cuits).toEqual(["30900001118"]);
    expect.soft(line("NUEVA SA")?.cuits).toEqual([]);
  });
});

describe("its filters", () => {
  it.each([
    ["todas", ["ALIMENTOS SA", "TEXTIL SA", "NUEVA SA"]],
    ["derivadas", ["ALIMENTOS SA", "TEXTIL SA"]],
    ["sin", ["NUEVA SA"]],
    ["plan", ["TEXTIL SA"]],
    ["altas", ["ALIMENTOS SA"]],
    ["nov", ["TEXTIL SA"]],
    ["not a filter", ["ALIMENTOS SA", "TEXTIL SA", "NUEVA SA"]],
  ])("%s", (filter, expected) => {
    expect(names("", filter)).toEqual(expected);
  });

  it("each company goes in forwarded or in not forwarded", () => {
    const count = (id: string) =>
      lines.filter(({ stats }) => COMPANY_FILTERS.find((f) => f.id === id)?.matches(stats)).length;
    expect(count("derivadas") + count("sin")).toBe(lines.length);
  });

  it("search by name or part of the CUIT", () => {
    expect.soft(names("textil", "todas")).toEqual(["TEXTIL SA"]);
    expect.soft(names("90000511", "todas")).toEqual(["TEXTIL SA"]);
    expect.soft(names("900", "todas"), "fewer than 4 digits is not a CUIT").toEqual([]);
  });

  it("say how many they leave", () => {
    expect.soft(companiesCountText(3, 3)).toBe("3 empresas");
    expect.soft(companiesCountText(1, 3)).toBe("1 de 3 empresas");
  });
});
